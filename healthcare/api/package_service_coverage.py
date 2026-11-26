"""Admission quotation coverage and immutable clinical usage snapshots.

No rates are fetched or calculated here. Existing clinical amounts are used only.
Coverage comments are audit metadata, never accounting or service charge rows.
"""

import hashlib
import html
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

EVENT = "inpatient_service_coverage"
FLAGS = {
    "therapy": "custom_include_therapy_sessions",
    "consultation": "custom_include_consultations",
    "lab": "custom_include_lab_tests",
    "observation": "custom_include_observation",
}
INVALID = {"Cancelled", "Canceled", "Rejected", "Entered in Error", "No Show", "No-show", "Missed"}


def recorded_amount(doc, *fields):
    for field in fields:
        value = doc.get(field)
        if value is not None and value != "":
            return flt(value)
    return 0.0


def lock_service(doc):
    if doc.get("doctype") and doc.get("name"):
        frappe.db.get_value(doc.doctype, doc.name, "name", for_update=True)


def admission_for(doc):
    patient = doc.get("patient") or doc.get("patient_num") or doc.get("file_number")
    admission = doc.get("admission_number") or doc.get("inpatient_record") or doc.get("inpatient_admission") or doc.get("admission_no")
    visit = doc.get("patient_visit")
    if not admission and visit and frappe.db.exists("Patient Visit", visit):
        admission = frappe.db.get_value("Patient Visit", visit, "inpatient_record")
    if not admission and doc.get("service_request"):
        admission = frappe.db.get_value("Service Request", doc.service_request, "inpatient_record")
    if not admission:
        return None
    from healthcare.healthcare.care_episode_guard import resolve_inpatient_admission_name
    name = resolve_inpatient_admission_name(admission, patient)
    if not name:
        return None
    adm = frappe.get_doc("Inpatient Admission", name)
    return adm if patient and adm.patient == patient else None


def applicable_quotation(admission):
    from healthcare.api.inpatient_admission import _resolve_admission_package
    from healthcare.api.package_change_history import active_change_quotation
    package, source = _resolve_admission_package(admission)
    if not package and source != "custom":
        return None
    filters = {"custom_inpatient_admission": admission.name,
        "custom_package": package if package else ["is", "not set"], "docstatus": ["<", 2]}
    active = active_change_quotation(admission.name, package or "__custom__")
    if active:
        filters["name"] = active
    rows = frappe.get_all("Quotation", filters=filters, fields=["name", *FLAGS.values()], limit_page_length=2)
    if len(rows) > 1:
        frappe.throw(_("Multiple active package quotations exist for admission {0}. Resolve the active quotation before billing.").format(admission.name))
    return rows[0] if rows else None


def has_separate_billing(doc, service_date=None, template=None):
    """Never waive, retire or rewrite any active pre-existing bill."""
    if doc.get("doctype") == "Observation" and service_date:
        from healthcare.api.observation import _existing_observation_sales_order_for_date
        if _existing_observation_sales_order_for_date(doc.name, str(getdate(service_date))):
            return True
        if not frappe.get_meta("Sales Invoice").has_field("custom_base_reference"):
            return False
        return bool(frappe.db.exists("Sales Invoice", {"custom_base_reference": "Observation",
            "custom_base_reference_name": doc.name, "posting_date": getdate(service_date), "docstatus": ["<", 2]}))
    for field, dt in (("invoice_no", "Sales Order"), ("ref_sales_invoice", "Sales Invoice")):
        name = doc.get(field)
        if name and frappe.db.exists(dt, {"name": name, "docstatus": ["<", 2]}):
            return True
    dt, name = doc.get("reference_document_type"), doc.get("reference_document_name")
    if dt in ("Sales Order", "Sales Invoice") and name and frappe.db.exists(dt, {"name": name, "docstatus": ["<", 2]}):
        return True
    refs = [(doc.get("doctype"), doc.get("name"))]
    if doc.get("service_request"):
        refs.append(("Service Request", doc.service_request))
    for ref_dt, ref_name in refs:
        if not ref_dt or not ref_name:
            continue
        for billing_dt in ("Sales Order", "Sales Invoice"):
            meta = frappe.get_meta(billing_dt)
            if meta.has_field("custom_base_reference"):
                filters = {"custom_base_reference": ref_dt, "custom_base_reference_name": ref_name, "docstatus": ["<", 2]}
                if doc.get("doctype") == "Patient Visit" and template:
                    item = frappe.db.get_value("Healthcare Service Template", template, "item_code")
                    bills = frappe.get_all(billing_dt, filters=filters, pluck="name")
                    if item and bills and frappe.db.exists(billing_dt + " Item", {"parent": ["in", bills], "item_code": item}):
                        return True
                elif frappe.db.exists(billing_dt, filters):
                    return True
        if ref_dt == "Patient Appointment" and frappe.get_meta("Sales Invoice").has_field("appointment") and frappe.db.exists("Sales Invoice", {"appointment": ref_name, "docstatus": ["<", 2]}):
            return True
    request = doc.get("service_request") or doc.get("sr_num")
    if doc.get("doctype") != "Service Request" and request and frappe.db.exists("Service Request", request):
        sr = frappe.get_doc("Service Request", request)
        return has_separate_billing(sr)
    return False


def _clinical_identity(doc):
    """Capture editable clinical links without changing the source record."""
    return {
        "session_type": doc.get("session_type"),
        "template": doc.get("template"),
        "template_dt": doc.get("template_dt"),
        "template_dn": doc.get("template_dn"),
        "reference_doctype": doc.get("reference_doctype"),
        "reference_docname": doc.get("reference_docname"),
        "service_request": doc.get("service_request") or doc.get("sr_num"),
        "date": str(doc.get("appointment_date") or doc.get("date") or doc.get("order_date") or ""),
    }


def _snapshot_matches(event, doc):
    identity = event.get("clinical_identity")
    return identity is None or identity == _clinical_identity(doc)


def coverage_for(doc, template=None, category=None, item_code=None):
    from healthcare.api.inpatient_admission import is_enhanced_workflow_enabled
    if not is_enhanced_workflow_enabled() or cint(doc.get("docstatus")) == 2 or (doc.get("transaction_status") or doc.get("status")) in INVALID:
        return None
    admission = admission_for(doc)
    if not admission:
        return None
    if doc.get("doctype") and doc.get("name") and doc.doctype not in ("Observation", "Patient Visit"):
        saved = frappe.get_all("Comment", filters={"reference_doctype": doc.doctype,
            "reference_name": doc.name, "subject": "Package coverage: " + admission.name}, fields=["content"], limit_page_length=0)
        for row in saved:
            event = _decode(row.content)
            if event and _snapshot_matches(event, doc) and (not category or event.get("category") == category) and (not template or event.get("template") == template):
                return {key: event.get(key) for key in ("admission", "quotation", "category", "template")}
    categories = []
    if category:
        categories = [category]
    else:
        if not template and doc.get("template_dt") == "Healthcare Service Template":
            template = doc.get("template_dn")
        if not template and doc.get("service_request"):
            sr = frappe.db.get_value("Service Request", doc.service_request, ["template_dt", "template_dn"], as_dict=True)
            if sr and sr.template_dt == "Healthcare Service Template":
                template = sr.template_dn
        if template:
            templates = [frappe.get_doc("Healthcare Service Template", template)]
        elif item_code:
            templates = frappe.get_all("Healthcare Service Template", filters={"item_code": item_code, "disabled": 0},
                fields=["name", "custom_therapy", "custom_consultation", "is_medical_supervision"])
        else:
            return None
        if not templates:
            return None
        signatures = {(bool(cint(t.get("custom_therapy"))), bool(cint(t.get("custom_consultation"))), bool(cint(t.get("is_medical_supervision")))) for t in templates}
        if len(signatures) != 1:
            frappe.throw(_("Item {0} maps to differently classified service templates. Select an explicit Healthcare Service Template before billing.").format(item_code))
        therapy, consultation, medical_supervision = next(iter(signatures))
        if medical_supervision:
            return None
        categories = [key for key, enabled in (("therapy", therapy), ("consultation", consultation)) if enabled]
    if not categories:
        return None
    request = doc.get("service_request") or doc.get("sr_num")
    if doc.get("doctype") in ("Lab Test", "Patient Appointment", "Session Schedule") and request:
        parent_rows = frappe.get_all("Comment", filters={"reference_doctype": "Service Request", "reference_name": request,
            "subject": "Package coverage: " + admission.name}, fields=["content"], limit_page_length=0)
        for row in parent_rows:
            event = _decode(row.content)
            if event and event.get("category") in categories:
                return {key: event.get(key) for key in ("admission", "quotation", "category", "template")}
    quotation = applicable_quotation(admission)
    if not quotation:
        return None
    for kind in categories:
        if cint(quotation.get(FLAGS[kind])):
            return {"admission": admission.name, "quotation": quotation.name, "category": kind, "template": template}
    return None



def appointment_coverage(doc):
    """Only an explicit HST reference can classify an appointment for coverage."""
    template = None
    if doc.get("reference_doctype") == "Healthcare Service Template":
        template = doc.get("reference_docname")
    if not template and doc.get("service_request"):
        sr = frappe.db.get_value("Service Request", doc.service_request,
            ["template_dt", "template_dn"], as_dict=True)
        if sr and sr.template_dt == "Healthcare Service Template":
            template = sr.template_dn
    return coverage_for(doc, template=template) if template else None


def _decode(content):
    match = re.search(r"<pre[^>]*>(.*?)</pre>", content or "", re.S)
    try:
        data = json.loads(html.unescape(match.group(1))) if match else {}
    except (ValueError, TypeError):
        return {}
    return data if data.get("event") == EVENT else {}


def record_coverage(doc, coverage, amount, service_date=None, key=""):
    if not coverage:
        return None
    service_date = str(getdate(service_date or doc.get("date") or doc.get("posting_date") or doc.get("order_date") or doc.get("creation") or nowdate()))
    if has_separate_billing(doc, service_date, coverage.get("template")):
        return None
    identity = json.dumps([doc.doctype, doc.name, service_date, key, _clinical_identity(doc)], sort_keys=True, separators=(",", ":"))
    name = "PKGCOV-" + hashlib.sha256(identity.encode()).hexdigest()[:32]
    # Serialize repeated/daily/manual attempts without adding a schema field.
    frappe.db.get_value("Inpatient Admission", coverage["admission"], "name", for_update=True)
    if frappe.db.exists("Comment", name):
        return name
    payload = dict(coverage, event=EVENT, source_doctype=doc.doctype, source_name=doc.name,
        service_date=service_date, key=key, amount=flt(amount), clinical_identity=_clinical_identity(doc))
    comment = frappe.get_doc({"doctype": "Comment", "comment_type": "Comment",
        "reference_doctype": doc.doctype, "reference_name": doc.name,
        "subject": "Package coverage: " + coverage["admission"],
        "content": "<p>Package-covered service</p><pre>" + html.escape(json.dumps(payload), quote=False) + "</pre>"})
    comment.insert(ignore_permissions=True, set_name=name)
    return name


def covered_response(doc, coverage, amount, service_date=None, key=""):
    if has_separate_billing(doc, service_date, coverage.get("template")):
        frappe.throw(_("An existing billing document is linked to this service. Use that document; no new package bill was created."))
    record_coverage(doc, coverage, amount, service_date, key)
    return {"covered_by_package": True, "sales_order": None, "sales_invoice": None,
        "quotation": coverage["quotation"], "message": _("Service is included in the admission package; no separate bill is required.")}


def snapshot_clinical_coverage(doc, method=None):
    """Keep a coverage decision with clinical records, even if no bill button is used."""
    dt = doc.doctype
    category = "lab" if dt == "Lab Test" else "observation" if dt == "Observation" else None
    template = doc.get("session_type") if dt == "Session Schedule" else None
    try:
        if dt == "Patient Appointment":
            coverage = appointment_coverage(doc)
        else:
            coverage = coverage_for(doc, template=template, category=category)
    except frappe.ValidationError:
        # Ambiguity must block billing, not clinical documentation.
        return
    if coverage:
        amount = recorded_amount(doc, "amount", "paid_amount", "grand_total", "cost")
        if dt == "Observation":
            return  # Observation periods are recorded by the daily/manual charging guard.
        record_coverage(doc, coverage, amount, doc.get("appointment_date"))



def _lab_completed(doc):
    return cint(doc.get("docstatus")) != 2 and (doc.get("status") in {"Approved", "Completed"}
        or (doc.get("status") == "Reviewed" and doc.get("approved_date")))


def _completed_value(event, doc, today=None):
    if not doc or cint(doc.get("docstatus")) == 2 or getdate(event["service_date"]) > getdate(today or nowdate()):
        return 0.0
    status = doc.get("transaction_status") if event["source_doctype"] == "Session Schedule" else doc.get("status")
    if status in INVALID:
        return 0.0
    dt = event["source_doctype"]
    if dt == "Session Schedule":
        return recorded_amount(doc, "amount") if status in {"Completed", "Submitted"} else 0.0
    if dt == "Lab Test":
        approved = _lab_completed(doc)
        return recorded_amount(doc, "grand_total", "amount") if approved else 0.0
    if dt == "Patient Appointment":
        return recorded_amount(doc, "paid_amount") if status == "Checked Out" else 0.0
    if dt == "Patient Visit":
        return flt(event.get("amount")) if status == "Completed" else 0.0
    if dt == "Observation":
        from healthcare.api.observation import _observation_is_billable_on_date
        day = getdate(event["service_date"])
        complete = status == "Completed" or day < getdate(today or nowdate())
        if not complete or not _observation_is_billable_on_date(doc, day):
            return 0.0
        return flt(event.get("amount"))
    if dt == "Service Request":
        if event.get("category") == "lab":
            # Group-only fees have no Lab Test row. Reconcile the stored request
            # total only after every actual child result is clinically complete.
            children = doc.get("_coverage_lab_children") or []
            if not children or not all(_lab_completed(child) for child in children):
                return 0.0
            child_value = sum(recorded_amount(child, "grand_total", "amount") for child in children)
            return max(recorded_amount(doc, "grand_total", "cost") - child_value, 0)
        if doc.get("_coverage_has_clinical_children"):
            return 0.0
        if status in {"completed-Request Status", "Completed"}:
            return recorded_amount(doc, "grand_total", "cost")
    # Acceptance/booked flags alone are never clinical completion evidence.
    return 0.0


def completed_covered_value(admission, from_date=None, to_date=None, include_details=False):
    comments = frappe.get_all("Comment", filters={"comment_type": "Comment", "subject": "Package coverage: " + admission},
        fields=["content"], limit_page_length=0)
    events = [_decode(row.content) for row in comments]
    events = [e for e in events if e and e.get("admission") == admission
        and (not from_date or getdate(e["service_date"]) >= getdate(from_date))
        and (not to_date or getdate(e["service_date"]) <= getdate(to_date))]
    sources = {}
    for dt in {e["source_doctype"] for e in events}:
        names = list({e["source_name"] for e in events if e["source_doctype"] == dt})
        for row in frappe.get_all(dt, filters={"name": ["in", names]}, fields=["*"], limit_page_length=0):
            row.doctype = dt
            sources[(dt, row.name)] = row
    requests = [name for dt, name in sources if dt == "Service Request"]
    if requests:
        children = set(frappe.get_all("Patient Appointment", filters={"service_request": ["in", requests], "docstatus": ["<", 2]}, pluck="service_request", limit_page_length=0))
        children.update(frappe.get_all("Session Schedule", filters={"sr_num": ["in", requests], "docstatus": ["<", 2]}, pluck="sr_num", limit_page_length=0))
        lab_children = frappe.get_all("Lab Test", filters={"service_request": ["in", requests]},
            fields=["name", "service_request", "status", "approved_date", "grand_total", "amount", "docstatus"], limit_page_length=0)
        for name in requests:
            sources[("Service Request", name)]["_coverage_has_clinical_children"] = name in children
            sources[("Service Request", name)]["_coverage_lab_children"] = [row for row in lab_children if row.service_request == name]
    completed_sessions = set()
    for event in events:
        if event["source_doctype"] != "Session Schedule":
            continue
        doc = sources.get(("Session Schedule", event["source_name"]))
        if doc and _snapshot_matches(event, doc) and doc.get("sr_num") and _completed_value(event, doc):
            completed_sessions.add((doc.sr_num, event["service_date"], event.get("category")))
    total, seen, details = 0.0, set(), []
    for event in events:
        doc = sources.get((event["source_doctype"], event["source_name"]))
        if not doc or not _snapshot_matches(event, doc) or has_separate_billing(doc, event.get("service_date"), event.get("template")):
            continue
        if doc.doctype == "Patient Appointment" and (doc.get("service_request"), event["service_date"], event.get("category")) in completed_sessions:
            continue
        identity = (event["source_doctype"], event["source_name"], event.get("key", ""))
        if event["source_doctype"] == "Observation":
            identity += (event["service_date"],)
        if identity in seen:
            continue
        value = _completed_value(event, doc)
        if value:
            seen.add(identity)
            total += value
            if include_details:
                code = event.get("template") or doc.get("session_type") or doc.get("template") or doc.get("template_dn") or doc.get("reference_docname") or doc.name
                label = doc.get("session_name") or doc.get("lab_test_name") or doc.get("service_name") or code
                details.append({
                    "item_code": code, "item_name": label,
                    "rate": flt(value, 3), "qty": 1, "frequency": 1,
                    "amount": flt(value, 3), "discount_amount": flt(value, 3),
                    "covered_by_package": True, "service_category": event.get("category"), "source_doctype": doc.doctype,
                    "source_name": doc.name, "service_date": event["service_date"],
                })
    if include_details:
        # Resolve names in one lookup without fetching or changing service prices.
        templates = list({row["item_code"] for row in details if row["item_name"] == row["item_code"]})
        names = {row.name: row.service_name for row in frappe.get_all(
            "Healthcare Service Template", filters={"name": ["in", templates]},
            fields=["name", "service_name"], limit_page_length=0,
        )} if templates else {}
        for row in details:
            label = names.get(row["item_code"]) or row["item_name"]
            row["item_name"] = html.escape(str(label))
            row["item_code"] = html.escape(str(row["item_code"]))
        details.sort(key=lambda row: (row["service_date"], row["source_doctype"], row["source_name"]))
        return {"amount": flt(total, 3), "rows": details}
    return flt(total, 3)


def filter_covered_visit_lines(visit, lines):
    """Do not alter rates or discounts of uncovered lines."""
    remaining, covered = [], False
    counts = {}
    for line in lines:
        template = line.get("template")
        coverage = coverage_for(visit, template=template, item_code=None if template else line.get("item_code"))
        if not coverage:
            remaining.append(line)
            continue
        covered = True
        identity = template or line.get("item_code") or "service"
        counts[identity] = counts.get(identity, 0) + 1
        record_coverage(visit, coverage, recorded_amount(line, "rate") * (flt(line.get("qty")) or 1),
            visit.get("encounter_date"), key=f"{identity}:{counts[identity]}")
    return remaining, covered
