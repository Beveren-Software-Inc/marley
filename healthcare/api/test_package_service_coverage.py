"""Package coverage regressions using isolated clinical documents, no site writes."""

import ast
from contextlib import ExitStack
import html
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import cint, flt, getdate

from healthcare.api import package_service_coverage as coverage
from healthcare.api import package_change_history as history


class Record(frappe._dict):
    def append(self, field, values):
        self.setdefault(field, []).append(Record(values))
        return self[field][-1]

    def db_set(self, field, value, **kwargs):
        self[field] = value

    def insert(self, **kwargs):
        self["inserted"] = True
        return self

    def submit(self):
        self.docstatus = 1

    def save(self, **kwargs):
        self["saved"] = True


def load_function(filename, name, env):
    source = Path(__file__).with_name(filename).read_text()
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), filename, "exec"), env)
    return env[name]


class CoverageTest(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.settings = SimpleNamespace(is_enhanced_workflow_enabled=lambda: True,
            _resolve_admission_package=lambda adm: ("Royal", "admission"))
        self.stack.enter_context(patch.dict(sys.modules, {"healthcare.api.inpatient_admission": self.settings,
            "healthcare.api.observation": SimpleNamespace(_observation_is_billable_on_date=lambda *a:True)}))
        self.stack.enter_context(patch.object(coverage, "_", side_effect=lambda text: text))
        self.stack.enter_context(patch.object(frappe, "throw", side_effect=ValueError))
        self.stack.enter_context(patch.object(coverage, "nowdate", return_value="2026-11-25"))
        self.stack.enter_context(patch.object(frappe, "get_system_settings", return_value="Commercial Rounding"))
        self.db = MagicMock()
        self.db.exists.return_value = False
        self.stack.enter_context(patch.object(frappe, "db", self.db, create=True))
        self.get_all = self.stack.enter_context(patch.object(frappe, "get_all", return_value=[]))
        self.get_doc = self.stack.enter_context(patch.object(frappe, "get_doc"))
        self.doc = Record(doctype="Session Schedule", name="SESSION", admission_number="ADM", patient_num="PAT",
            session_type="THERAPY", transaction_status="Completed", amount=30, date="2026-11-20")
        self.admission = Record(name="ADM", patient="PAT")
        self.quote = Record(name="CURRENT-Q", **{field: 1 for field in coverage.FLAGS.values()})

    def test_snapshot_rejects_changed_template_and_date(self):
        event = {"clinical_identity": coverage._clinical_identity(self.doc)}
        self.assertTrue(coverage._snapshot_matches(event, self.doc))
        self.doc.session_type = "OTHER"
        self.assertFalse(coverage._snapshot_matches(event, self.doc))
        self.doc.session_type = "THERAPY"
        self.doc.date = "2026-11-21"
        self.assertFalse(coverage._snapshot_matches(event, self.doc))

    def test_group_lab_only_counts_recorded_residual_after_all_results_complete(self):
        event = {"source_doctype": "Service Request", "category": "lab", "service_date": "2026-11-20"}
        doc = Record(grand_total=25, _coverage_lab_children=[Record(status="Approved", grand_total=15)])
        self.assertEqual(coverage._completed_value(event, doc), 10)
        doc._coverage_lab_children[0].status = "Pending"
        self.assertEqual(coverage._completed_value(event, doc), 0)
        doc._coverage_lab_children[0].status = "Approved"
        doc.grand_total = 0
        self.assertEqual(coverage._completed_value(event, doc), 0)

    def test_each_category_included_and_excluded(self):
        with patch.object(coverage, "admission_for", return_value=self.admission), patch.object(coverage, "applicable_quotation", return_value=self.quote):
            for kind, field in coverage.FLAGS.items():
                with self.subTest(category=kind):
                    self.quote[field] = 1
                    self.assertEqual(coverage.coverage_for(self.doc, category=kind)["quotation"], "CURRENT-Q")
                    self.quote[field] = 0
                    self.assertIsNone(coverage.coverage_for(self.doc, category=kind))
                    self.quote[field] = 1

    def test_classification_and_medical_supervision_exclusion(self):
        with patch.object(coverage, "admission_for", return_value=self.admission), patch.object(coverage, "applicable_quotation", return_value=self.quote):
            for field, category in (("custom_therapy", "therapy"), ("custom_consultation", "consultation")):
                self.get_doc.return_value = Record(**{field: 1})
                self.assertEqual(coverage.coverage_for(self.doc, template="T")["category"], category)
            self.get_doc.return_value = Record(custom_therapy=1, is_medical_supervision=1)
            self.assertIsNone(coverage.coverage_for(self.doc, template="MS"))

    def test_appointment_requires_explicit_hst_and_never_classifies_generic_item(self):
        with patch.object(coverage, "coverage_for", return_value={"category": "consultation"}) as resolve:
            generic = Record(doctype="Patient Appointment", billing_item="Appointment Charges")
            self.assertIsNone(coverage.appointment_coverage(generic))
            resolve.assert_not_called()
            explicit = Record(reference_doctype="Healthcare Service Template", reference_docname="CONSULTATION")
            self.assertEqual(coverage.appointment_coverage(explicit)["category"], "consultation")
            resolve.assert_called_once_with(explicit, template="CONSULTATION")
        self.db.get_value.return_value = Record(template_dt="Healthcare Service Template", template_dn="THERAPY")
        with patch.object(coverage, "coverage_for", return_value={"category": "therapy"}) as resolve:
            linked = Record(service_request="SR")
            self.assertEqual(coverage.appointment_coverage(linked)["category"], "therapy")
            resolve.assert_called_once_with(linked, template="THERAPY")

    def test_legacy_and_no_admission_are_uncovered(self):
        self.settings.is_enhanced_workflow_enabled = lambda: False
        self.assertIsNone(coverage.coverage_for(self.doc, category="lab"))
        self.settings.is_enhanced_workflow_enabled = lambda: True
        with patch.object(coverage, "admission_for", return_value=None):
            self.assertIsNone(coverage.coverage_for(self.doc, category="lab"))

    def test_applicable_quote_uses_change_history_not_last_modified(self):
        self.get_all.return_value = [self.quote]
        with patch.object(history, "active_change_quotation", return_value="CURRENT-Q"):
            self.assertEqual(coverage.applicable_quotation(self.admission), self.quote)
        filters = self.get_all.call_args.kwargs["filters"]
        self.assertEqual(filters["name"], "CURRENT-Q")
        self.assertEqual(filters["docstatus"], ["<", 2])

    def test_ambiguous_quotations_stop_billing(self):
        self.get_all.return_value = [self.quote, Record(name="OLD-Q")]
        with patch.object(history, "active_change_quotation", return_value=None), self.assertRaises(ValueError):
            coverage.applicable_quotation(self.admission)

    def test_saved_decision_survives_package_change(self):
        event = dict(event=coverage.EVENT, admission="ADM", quotation="PREVIOUS-Q", category="therapy", template="THERAPY")
        self.get_all.return_value = [Record(content="<pre>" + html.escape(json.dumps(event)) + "</pre>")]
        with patch.object(coverage, "admission_for", return_value=self.admission), patch.object(coverage, "applicable_quotation") as current:
            self.assertEqual(coverage.coverage_for(self.doc, template="THERAPY")["quotation"], "PREVIOUS-Q")
            current.assert_not_called()

    def test_recording_is_idempotent_and_does_not_create_accounting_docs(self):
        names, inserted = set(), []
        self.db.exists.side_effect = lambda dt, name: name in names if dt == "Comment" else False
        def new_comment(values):
            obj = MagicMock()
            def insert(**kwargs):
                names.add(kwargs["set_name"])
                inserted.append(values)
            obj.insert.side_effect = insert
            return obj
        self.get_doc.side_effect = new_comment
        decision = dict(admission="ADM", quotation="Q1", category="therapy", template="THERAPY")
        with patch.object(coverage, "has_separate_billing", return_value=False):
            for _ in range(2):
                coverage.record_coverage(self.doc, decision, 30)
        self.assertEqual(len(inserted), 1)
        self.assertEqual(inserted[0]["doctype"], "Comment")
        self.assertEqual(coverage._decode(inserted[0]["content"])["amount"], 30)

    def test_existing_billing_prevents_coverage_usage_record(self):
        with patch.object(coverage, "has_separate_billing", return_value=True):
            self.assertIsNone(coverage.record_coverage(self.doc, dict(admission="ADM"), 30))
        self.get_doc.assert_not_called()

    def test_zero_recorded_amount_is_never_replaced(self):
        self.assertEqual(coverage.recorded_amount(Record(amount=0, cost=99), "amount", "cost"), 0)
        self.assertEqual(coverage.recorded_amount(Record(amount=None, cost=40), "amount", "cost"), 40)

    def test_complete_and_bill_keeps_submitted_status_for_covered_session(self):
        self.db.exists.return_value = True
        self.get_doc.return_value = self.doc
        self.doc.as_dict = lambda: {"name": self.doc.name, "transaction_status": self.doc.transaction_status}
        run = load_function("session_schedule.py", "create_sales_order_from_session_schedule", {
            "frappe": frappe, "_": lambda text: text,
            "_create_session_schedule_sales_order": lambda doc: {"covered_by_package": True, "sales_order": None},
            "_attach_sales_orders": lambda rows: rows,
        })
        result = run(self.doc.name)
        self.assertEqual(result["transaction_status"], "Submitted")
        self.assertTrue(result["covered_by_package"])
        self.assertIsNone(result["sales_order"])
        self.assertEqual(result["message"], "Session is covered by the package.")

    def test_completion_states_for_sessions_consultations_and_labs(self):
        cases = [
            ("Session Schedule", "Completed", {}, 30), ("Session Schedule", "Submitted", {}, 30),
            ("Session Schedule", "Draft", {}, 0),
            ("Session Schedule", "In Progress", {}, 0), ("Session Schedule", "Cancelled", {}, 0),
            ("Patient Appointment", "Checked Out", {}, 40), ("Patient Appointment", "Scheduled", {}, 0),
            ("Patient Appointment", "No Show", {}, 0), ("Lab Test", "Approved", {}, 15),
            ("Lab Test", "Completed", {}, 15), ("Lab Test", "Reviewed", {"approved_date": "2026-11-21"}, 15),
            ("Lab Test", "Reviewed", {}, 0), ("Lab Test", "Pending Review", {}, 0),
            ("Lab Test", "Requested", {}, 0), ("Lab Test", "Rejected", {}, 0),
        ]
        for dt, status, extra, expected in cases:
            with self.subTest(doctype=dt, status=status):
                amount = 30 if dt == "Session Schedule" else 15
                doc = Record(amount=amount, paid_amount=40, status=status, transaction_status=status, **extra)
                event = dict(source_doctype=dt, service_date="2026-11-20")
                self.assertEqual(coverage._completed_value(event, doc, "2026-11-25"), expected)

    def test_observation_counts_only_completed_periods(self):
        doc = Record(status="Registered", amount=20)
        event = dict(source_doctype="Observation", service_date="2026-11-24", amount=20)
        with patch("healthcare.api.observation._observation_is_billable_on_date", return_value=True):
            self.assertEqual(coverage._completed_value(event, doc, "2026-11-25"), 20)
            event["service_date"] = "2026-11-25"
            self.assertEqual(coverage._completed_value(event, doc, "2026-11-25"), 0)
            doc.status = "Completed"
            self.assertEqual(coverage._completed_value(event, doc, "2026-11-25"), 20)
            doc.status = "Cancelled"
            self.assertEqual(coverage._completed_value(event, doc, "2026-11-25"), 0)

    def test_aggregation_repeated_report_duplicates_and_existing_bills(self):
        events = [dict(event=coverage.EVENT, admission="ADM", quotation="HISTORICAL-Q", source_doctype=dt,
            source_name=name, service_date="2026-11-20", amount=amount, category=kind)
            for dt, name, amount, kind in [("Session Schedule", "T1", 30, "therapy"),
                ("Session Schedule", "C1", 40, "consultation"), ("Lab Test", "L1", 15, "lab"), ("Observation", "O1", 20, "observation")]]
        events.append(events[0])
        docs = {"Session Schedule": [Record(name="T1", session_name="Therapy", transaction_status="Completed", amount=30), Record(name="C1", session_name="Consultation", transaction_status="Completed", amount=40)],
            "Lab Test": [Record(name="L1", lab_test_name="Lab", status="Approved", amount=15)], "Observation": [Record(name="O1", service_name="Observation", status="Completed")]}
        self.get_all.side_effect = lambda dt, **kwargs: [Record(content="<pre>" + html.escape(json.dumps(e)) + "</pre>") for e in events] if dt == "Comment" else docs.get(dt, [])
        with patch.object(coverage, "has_separate_billing", return_value=False), patch("healthcare.api.observation._observation_is_billable_on_date", return_value=True):
            self.assertEqual(coverage.completed_covered_value("ADM"), 105)
            self.assertEqual(coverage.completed_covered_value("ADM"), 105)
            detail = coverage.completed_covered_value("ADM", include_details=True)
            self.assertEqual(detail["amount"], 105)
            self.assertEqual(len(detail["rows"]), 4)
            self.assertEqual(sum(row["amount"] for row in detail["rows"]), 105)
            self.assertTrue(all(row["covered_by_package"] for row in detail["rows"]))
            self.assertEqual({row["item_name"] for row in detail["rows"]}, {"Therapy", "Consultation", "Lab", "Observation"})
            self.assertEqual(coverage.completed_covered_value("ADM", "2026-11-21"), 0)
        with patch.object(coverage, "has_separate_billing", return_value=True):
            self.assertEqual(coverage.completed_covered_value("ADM"), 0)

    def test_soa_session_codes_use_configuration_and_standard_therapy_links(self):
        self.get_all.side_effect = lambda dt, **kwargs: [Record(name="CONFIGURED", item_code="BILLING-ITEM")] if dt == "Healthcare Service Template" else [Record(item="STANDARD-THERAPY", item_code="LEGACY-THERAPY")]
        self.db.exists.return_value = True
        run = load_function("reception_reports.py", "_soa_session_item_codes", {"frappe": frappe})
        with patch.object(frappe, "local", SimpleNamespace()):
            self.assertEqual(run(), {"CONFIGURED", "BILLING-ITEM", "STANDARD-THERAPY", "LEGACY-THERAPY"})
            query_count = self.get_all.call_count
            run()
            self.assertEqual(self.get_all.call_count, query_count)
        self.assertEqual(self.get_all.call_args_list[0].kwargs["or_filters"], {"custom_therapy": 1, "custom_consultation": 1})

    def test_ip_soa_sessions_and_ordinary_services_keep_special_categories(self):
        run = load_function("reception_reports.py", "_soa_ip_service_category", {"_soa_session_item_codes": lambda: {"THERAPY", "CONSULTATION", "STANDARD-THERAPY"}})
        for code in ("THERAPY", "CONSULTATION", "STANDARD-THERAPY"):
            for category in ("Services", "Other Services"):
                self.assertEqual(run(dict(category=category, item_code=code)), "Sessions")
        self.assertEqual(run(dict(category="Other Services", item_code="ORDINARY", item_name="Therapy-looking name")), "Services")
        for category in ("Standard Admission Assessment Fee", "Room Charge", "Medical Supervision", "Medicines", "Lab Tests"):
            self.assertEqual(run(dict(category=category, item_code="THERAPY")), category)

    def test_session_display_preserves_aggregation_amount_quantity_and_frequency(self):
        env = {"frappe": frappe, "flt": flt, "SOA_LAB_SUMMARY_CODES": set(), "SOA_MED_SUMMARY_CODES": set()}
        aggregate = load_function("reception_reports.py", "_soa_bucket_raw_lines", env)
        classify = load_function("reception_reports.py", "_soa_ip_service_category", {"_soa_session_item_codes": lambda: {"CONFIGURED"}})
        for category in ("Services", "Other Services"):
            rows = [dict(item_code="CONFIGURED", item_name="Configured service", category=category, rate=30, qty=2, amount=60, discount_amount=5, discount_percentage=0), dict(item_code="CONFIGURED", item_name="Configured service", category=category, rate=30, qty=1, amount=30, discount_amount=0, discount_percentage=0)]
            before = next(iter(aggregate(rows).values()))
            after = dict(before, category=classify(before))
            self.assertEqual(after["category"], "Sessions")
            for field in ("amount", "qty", "frequency", "rate", "discount_amount"):
                self.assertEqual(after[field], before[field])

    def test_ip_soa_paid_table_setting_enabled_disabled_missing_and_unavailable(self):
        run = load_function("reception_reports.py", "_hide_paid_table_in_ip_soa", {"frappe": frappe, "cint": cint})
        with patch.object(frappe, "get_meta", return_value=SimpleNamespace(has_field=lambda field: True)):
            for value, expected in ((1, True), (0, False), (None, False)):
                self.db.get_single_value.return_value = value
                self.assertEqual(run(), expected)
        with patch.object(frappe, "get_meta", return_value=SimpleNamespace(has_field=lambda field: False)):
            self.assertFalse(run())
        with patch.object(frappe, "get_meta", side_effect=RuntimeError("Settings unavailable")):
            self.assertFalse(run())

    def test_actual_soa_keeps_existing_discount_net_payment_and_balance(self):
        adm = Record(name="ADM", patient="PAT", case_no="ADM", scheduled_date="2026-11-20", discharge_datetime=None,
            cost_center="BRANCH", patient_name="Patient", admission_doctor_name="Doctor")
        self.db.exists.return_value = True
        self.db.get_value.side_effect = lambda dt, *a, **k: adm if dt == "Inpatient Admission" else "FILE"
        env = dict(frappe=frappe, flt=flt, getdate=getdate, _=lambda t:t,
            _admission_sales_orders=lambda a: [], _soa_so_base_map=lambda s: {}, _admission_sales_invoices=lambda *a: [],
            _admission_package_quotation_lines=lambda a: [],
            _soa_bucket_raw_lines=lambda lines: {"normal": dict(qty=1, amount=200, discount_amount=10, category="Services", item_name="Normal")},
            _soa_ordered_ip_categories=lambda c:c, _soa_ip_service_category=lambda row:row["category"], _hide_paid_table_in_ip_soa=lambda:False, _admission_payments=lambda a: [],
            _soa_payment_payload=lambda *a, **k: {"paid_total": 50}, _letter_head_for_cost_center=lambda *a,**k:None)
        run = load_function("reception_reports.py", "get_ip_statement_of_account", env)
        self.stack.enter_context(patch.object(frappe.utils, "today", return_value="2026-11-25"))
        results = []
        for value in (0,105,105):
            rows = [{"item_code": "THERAPY", "item_name": "Therapy", "service_category": "therapy", "amount": value}] if value else []
            with patch.object(coverage, "completed_covered_value", return_value={"amount": value, "rows": rows}):
                results.append(run("ADM"))
        before, after, repeated = results
        self.assertEqual(after["bill_total"], before["bill_total"]+105)
        self.assertEqual(after["discount_total"], before["discount_total"]+105)
        for field in ("net_total", "paid_total", "balance"):
            self.assertEqual(after[field], before[field])
        self.assertEqual(after["categories"]["Services"], before["categories"]["Services"])
        self.assertEqual(after["categories"]["Package included sessions"][0]["amount"], 105)
        self.assertEqual(after,repeated)


class ReceiptsClassificationTest(unittest.TestCase):
    def setUp(self):
        self.docs = {
            ("Inpatient Admission", "ADM"): Record(name="ADM", patient="IP-PAT"),
            ("Patient Visit", "VISIT"): Record(name="VISIT", patient="OP-PAT"),
            ("Sales Invoice", "DIRECT"): Record(name="DIRECT", custom_reference_type="Inpatient Admission", custom_reference_name="ADM"),
            ("Sales Invoice", "VIA-ORDERS"): Record(name="VIA-ORDERS"),
            ("Sales Order", "SO-IP"): Record(name="SO-IP", custom_reference_type="Inpatient Admission", custom_reference_name="ADM"),
            ("Sales Order", "SO-OP"): Record(name="SO-OP", custom_base_reference="Patient Visit", custom_base_reference_name="VISIT"),
            ("Sales Order", "SO-SESSION"): Record(name="SO-SESSION", custom_base_reference="Session Schedule", custom_base_reference_name="SESSION"),
            ("Sales Order", "SO-LAB"): Record(name="SO-LAB", custom_base_reference="Lab Test", custom_base_reference_name="LAB"),
            ("Session Schedule", "SESSION"): Record(name="SESSION", admission_number="ADM"),
            ("Patient Visit", "IP-VISIT"): Record(name="IP-VISIT", patient="IP-PAT", inpatient_record="ADM"),
            ("Session Schedule", "VIA-VISIT"): Record(name="VIA-VISIT", patient_visit="IP-VISIT"),
            ("Sales Invoice", "VISIT-INVOICE"): Record(name="VISIT-INVOICE", custom_reference_type="Patient Visit", custom_reference_name="IP-VISIT"),
            ("Lab Test", "LAB"): Record(name="LAB", service_request="SR"),
            ("Service Request", "SR"): Record(name="SR", inpatient_record="ADM"),
            ("Sales Order", "CYCLE"): Record(name="CYCLE", custom_base_reference="Service Request", custom_base_reference_name="LOOP"),
            ("Service Request", "LOOP"): Record(name="LOOP", reference_document_type="Sales Order", reference_document_name="CYCLE"),
        }
        self.api = SimpleNamespace(db=SimpleNamespace(get_value=lambda dt,name,*args,**kwargs:self.docs.get((dt,name))),
            get_meta=lambda dt:SimpleNamespace(has_field=lambda field:True), get_all=MagicMock(return_value=["NO-ORDER", "SO-IP"]))
        self.env = {"frappe": self.api, "flt": flt, "_": lambda text:text}
        self.resolve = load_function("reception_reports.py", "_receipt_case_reference", self.env)

    def test_explicit_and_indirect_episode_references(self):
        for dt,name,expected in (("Inpatient Admission","ADM","Inpatient Admission"),
            ("Patient Visit","VISIT","Patient Visit"), ("Sales Invoice","DIRECT","Inpatient Admission"),
            ("Sales Invoice","VIA-ORDERS","Inpatient Admission"), ("Sales Order","SO-OP","Patient Visit"),
            ("Sales Order","SO-SESSION","Inpatient Admission"), ("Sales Order","SO-LAB","Inpatient Admission"),
            ("Session Schedule","VIA-VISIT","Inpatient Admission"), ("Patient Visit","IP-VISIT","Inpatient Admission")):
            with self.subTest(doctype=dt,name=name):
                self.assertEqual(self.resolve(dt,name,{})[0],expected)
        self.assertIsNone(self.resolve("Inpatient Admission","MISSING",{}))
        self.assertIsNone(self.resolve("Sales Order","CYCLE",{}))
        self.assertIsNone(self.resolve("Patient","IP-PAT",{}))

    def test_explicit_visit_and_inferred_admission_caches_are_separate(self):
        for order in ((True, False), (False, True)):
            cache = {}
            for infer in order:
                result = self.resolve("Patient Visit", "IP-VISIT", cache, infer_visit_admission=infer)
                self.assertEqual(result[:2], ("Inpatient Admission", "ADM") if infer else ("Patient Visit", "IP-VISIT"))
            self.assertEqual(self.resolve("Inpatient Admission", "ADM", cache, infer_visit_admission=False)[:2], ("Inpatient Admission", "ADM"))
        self.assertEqual(self.resolve("Sales Invoice", "VISIT-INVOICE", {})[:2], ("Inpatient Admission", "ADM"))

    def test_missing_or_foreign_admission_keeps_visit_op(self):
        self.docs[("Inpatient Admission", "FOREIGN")] = Record(name="FOREIGN", patient="OTHER-PATIENT")
        for link in (None, "MISSING", "FOREIGN"):
            self.docs[("Patient Visit", "CHECK")] = Record(name="CHECK", patient="IP-PAT", inpatient_record=link)
            self.assertEqual(self.resolve("Patient Visit", "CHECK", {})[:2], ("Patient Visit", "CHECK"))
            self.docs[("Patient Visit", "CHECK")].ip_admission_no = "ADM"
            self.assertEqual(self.resolve("Patient Visit", "CHECK", {})[:2], ("Inpatient Admission", "ADM"))
        self.docs[("Patient Visit", "CHECK")] = Record(name="CHECK", patient=None, inpatient_record="ADM")
        self.assertEqual(self.resolve("Patient Visit", "CHECK", {})[0], "Patient Visit")

    def test_unavailable_visit_link_fields_keeps_visit_op(self):
        self.api.get_meta = lambda dt: SimpleNamespace(has_field=lambda field: False)
        self.assertEqual(self.resolve("Patient Visit", "IP-VISIT", {})[:2], ("Patient Visit", "IP-VISIT"))

    def test_case_priority_unallocated_and_duplicate_references_keep_one_row_and_amounts(self):
        def payment(name,amount,**fields):
            return Record(name=name,paid_amount=amount,party="CUSTOMER",cost_center="BRANCH",
                posting_date="2026-11-26",creation="2026-11-26 12:00:00",mode_of_payment="Cash",owner="Administrator",**fields)
        entries=[payment("TAGGED-IP",25,custom_op_or_ip="Inpatient Admission",custom_case_no="ADM"),
            payment("UNTAGGED",75),payment("TAGGED-OP",10,custom_op_or_ip="Patient Visit",custom_case_no="IP-VISIT"),
            payment("DIRECT-IP",40),payment("SESSION-IP",12),payment("LAB-IP",13),payment("VISIT-IP",15)]
        refs=[Record(parent="TAGGED-IP",reference_doctype="Sales Order",reference_name="SO-OP"),
            Record(parent="DIRECT-IP",reference_doctype="Sales Invoice",reference_name="DIRECT"),
            Record(parent="SESSION-IP",reference_doctype="Sales Order",reference_name="SO-SESSION"),
            Record(parent="SESSION-IP",reference_doctype="Sales Order",reference_name="SO-IP"),
            Record(parent="LAB-IP",reference_doctype="Sales Order",reference_name="SO-LAB"),
            Record(parent="VISIT-IP",reference_doctype="Sales Invoice",reference_name="VISIT-INVOICE")]
        self.api.get_all.side_effect=lambda dt,**kwargs:entries if dt=="Payment Entry" else refs
        self.env.update(_so_for_reference=lambda *a:None,_base_reference=lambda *a:(None,None,None,None),
            _patient_for_customer=lambda *a:"CUSTOMER-PAT",_patient_display=lambda patient,cache:{"file_no":patient,"patient_name":patient},_full_name=lambda *a:"Administrator")
        run=load_function("reception_reports.py","get_patient_receipts_summary",self.env)
        with patch.dict(sys.modules,{"healthcare.api.common":SimpleNamespace(resolve_cost_center_filter=lambda cc:cc)}):
            result=run("2026-11-26","2026-11-26",cost_center="BRANCH")
        self.assertEqual({row["rv_no"] for row in result["ip"]},{"TAGGED-IP","DIRECT-IP","SESSION-IP","LAB-IP","VISIT-IP"})
        self.assertEqual([row["rv_no"] for row in result["op"]],["TAGGED-OP"])
        self.assertEqual([row["rv_no"] for row in result["payment_only"]],["UNTAGGED"])
        self.assertTrue(all(row["case_no"]=="ADM" for row in result["ip"]))
        all_rows=[row for section in ("ip","op","payment_only") for row in result[section]]
        self.assertEqual(len(all_rows),len(entries))
        self.assertEqual({row["rv_no"]:row["amount"] for row in all_rows},{row.name:row.paid_amount for row in entries})
        self.assertEqual(result["grand_total"],190)
        self.assertEqual(sum(result["summary"].values()),190)


class BillingGuardTest(unittest.TestCase):
    def setUp(self):
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(coverage, "_", side_effect=lambda text:text))
        self.decision=dict(admission="ADM",quotation="Q",category="therapy",template="THERAPY")
        self.stack.enter_context(patch.object(coverage,"lock_service"))
        self.cover=self.stack.enter_context(patch.object(coverage,"coverage_for",return_value=self.decision))
        self.stack.enter_context(patch.object(coverage,"appointment_coverage",side_effect=lambda *a:self.cover(*a)))
        self.existing=self.stack.enter_context(patch.object(coverage,"has_separate_billing",return_value=False))
        self.record=self.stack.enter_context(patch.object(coverage,"record_coverage"))
        self.db=MagicMock();self.db.exists.return_value=True
        self.doc=Record(doctype="Session Schedule",name="SESSION",patient="PAT",patient_num="PAT",admission_number="ADM",
            session_type="THERAPY",amount=30,date="2026-11-20",transaction_status="Draft",docstatus=0,flags=Record())
        self.so=Record(name="SO",docstatus=0,items=[],flags=Record(),status="To Deliver")
        self.frappe=SimpleNamespace(db=self.db,get_doc=MagicMock(return_value=self.doc),new_doc=MagicMock(return_value=self.so),
            get_system_settings=lambda *a:None,get_cached_value=lambda *a:None,throw=MagicMock(side_effect=ValueError),defaults=MagicMock())
        self.env=dict(frappe=self.frappe,cint=cint,flt=flt,getdate=getdate,nowdate=lambda:"2026-11-25",_=lambda t:t,
            _existing_session_schedule_sales_order=MagicMock(return_value=None),_default_company=lambda d:"COMPANY",
            _resolve_session_schedule_billing=MagicMock(return_value=("ITEM",30,"Therapy","PAT")),
            _session_schedule_billing_refs=lambda d:("Inpatient Admission","ADM"),_patient_care_type_from_schedule=lambda d:"IP")
        self.run=load_function("session_schedule.py","_create_session_schedule_sales_order",self.env)
        modules={"healthcare.api.patient_file_no_charge":SimpleNamespace(_ensure_patient_customer=lambda p:"CUSTOMER"),
            "healthcare.api.sales_order_cost_center":SimpleNamespace(apply_cost_center_to_sales_order=lambda *a:None,cost_center_from_visit_or_admission=lambda *a:None),
            "healthcare.controllers.insurance_pricing":SimpleNamespace(resolve_charge=lambda **k:{},charge_list_and_discount=lambda c:{"list_rate":30,"discount_pct":0,"net_rate":30},sales_item_from_list_and_discount=lambda **k:k),
            "healthcare.api.inpatient_admission":SimpleNamespace(is_enhanced_workflow_enabled=lambda:True)}
        self.stack.enter_context(patch.dict(sys.modules,modules))

    def test_covered_session_skips_billing_and_does_not_fake_completion(self):
        result=self.run(self.doc)
        self.assertTrue(result["covered_by_package"])
        self.assertIsNone(result["sales_order"])
        self.frappe.new_doc.assert_not_called()
        self.env["_resolve_session_schedule_billing"].assert_not_called()
        self.assertEqual(self.doc.transaction_status,"Draft")
        self.assertEqual(self.doc.amount,30)

    def test_uncovered_session_uses_original_order_rate(self):
        self.cover.return_value=None
        result=self.run(self.doc)
        self.assertEqual(result["sales_order"],"SO")
        self.assertEqual(self.so.docstatus,1)
        self.assertEqual(self.so["items"][0]["list_rate"],30)

    def test_existing_session_order_is_preserved(self):
        self.env["_existing_session_schedule_sales_order"].return_value="SO-EXISTING"
        self.frappe.get_doc.return_value=self.so
        self.assertTrue(self.run(self.doc)["existing"])
        self.cover.assert_not_called()
        self.frappe.new_doc.assert_not_called()

    def test_existing_invoice_prevents_new_covered_session_order(self):
        self.existing.return_value = True
        with self.assertRaises(ValueError):
            self.run(self.doc)
        self.frappe.new_doc.assert_not_called()
        self.record.assert_not_called()

    def test_cancelled_session_cannot_bill(self):
        self.doc.transaction_status="Cancelled"
        with self.assertRaises(ValueError):self.run(self.doc)
        self.frappe.new_doc.assert_not_called()

    def test_appointment_and_direct_invoice_skip_order_invoice_and_payment(self):
        self.doc=Record(doctype="Patient Appointment",name="APPT",patient="PAT",status="Checked Out",paid_amount=40,
            appointment_date="2026-11-20",company="COMPANY")
        self.frappe.get_doc.return_value=self.doc
        env=dict(self.env,_find_appointment_sales_order=lambda name:None,_appointment_billing_item_and_rate=MagicMock())
        create=load_function("patient_appointment.py","create_sales_order_from_appointment",env)
        self.assertTrue(create("APPT",create_sales_invoice=1)["covered_by_package"])
        source=Path(__file__).parents[1]/"healthcare/doctype/patient_appointment/patient_appointment.py"
        node=next(n for n in ast.parse(source.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=="create_sales_invoice")
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),"exec"),env)
        self.assertTrue(env["create_sales_invoice"](self.doc)["covered_by_package"])
        self.frappe.new_doc.assert_not_called()
        env["_appointment_billing_item_and_rate"].assert_not_called()

    def test_existing_invoice_prevents_new_covered_appointment_order(self):
        self.existing.return_value = True
        self.doc = Record(doctype="Patient Appointment", name="APPT", patient="PAT", status="Checked Out", paid_amount=40)
        self.frappe.get_doc.return_value = self.doc
        create = load_function("patient_appointment.py", "create_sales_order_from_appointment",
            dict(self.env, _find_appointment_sales_order=lambda name: None))
        with self.assertRaises(ValueError):
            create("APPT", amount=40)
        self.frappe.new_doc.assert_not_called()

    def test_lab_confirmation_accepts_without_order_or_payment(self):
        self.doc = Record(doctype="Service Request", name="SR", patient="PAT", inpatient_record="ADM",
            template_dt="Lab Test Template", template_dn="LAB", patient_accepted_cost=0, grand_total=15)
        self.frappe.get_doc.return_value = self.doc
        self.db.get_value.return_value = "Lab Test Template"
        env = dict(self.env, _active_lab_request_sales_order=lambda doc:None)
        run = load_function("service_request.py", "confirm_payment", env)
        result = run("SR")
        self.assertTrue(result["covered_by_package"])
        self.assertEqual(self.doc.patient_accepted_cost, 1)
        self.frappe.new_doc.assert_not_called()
        self.assertEqual(self.record.call_args.args[2], 15)

    def test_observation_guard_uses_recorded_amount_and_preserves_existing_order(self):
        self.doc = Record(doctype="Observation", name="OBS", amount=20, status="Registered")
        env = dict(self.env, _existing_observation_sales_order_for_date=MagicMock(return_value=None))
        run = load_function("observation.py", "_create_observation_sales_order", env)
        self.assertTrue(run(self.doc, billing_date="2026-11-20", amount=999)["covered_by_package"])
        self.assertEqual(self.record.call_args.args[2], 20)
        self.frappe.new_doc.assert_not_called()
        env["_existing_observation_sales_order_for_date"].return_value="OLD-SO"
        self.frappe.get_doc.return_value=self.so
        self.cover.reset_mock()
        self.assertTrue(run(self.doc, billing_date="2026-11-20")["existing"])
        self.cover.assert_not_called()

    def test_uncovered_appointment_keeps_original_billing_path(self):
        self.cover.return_value=None
        self.doc=Record(doctype="Patient Appointment",name="APPT",patient="PAT",status="Checked Out",paid_amount=40,
            appointment_date="2026-11-20",company="COMPANY")
        self.frappe.get_doc.return_value=self.doc
        env=dict(self.env,_find_appointment_sales_order=lambda name:None,
            _appointment_billing_item_and_rate=lambda *a,**k:("Appointment Charges",40),
            cost_center_from_base_reference=lambda *a:None,apply_cost_center_to_sales_order=lambda *a:None)
        create=load_function("patient_appointment.py","create_sales_order_from_appointment",env)
        result=create("APPT",amount=40)
        self.assertEqual(result["sales_order"],"SO")
        self.frappe.new_doc.assert_called_once_with("Sales Order")
        self.assertEqual(self.so["items"][0]["rate"],40)

    def test_daily_mixed_services_keep_uncovered_amount_and_skip_all_covered(self):
        self.doc=Record(doctype="Patient Visit",name="VISIT",patient="PAT",inpatient_record="ADM",encounter_date="2026-11-20")
        setup=Record(services=[Record(session="THERAPY",amount=30),Record(session="OTHER",amount=12)])
        env=dict(self.env,_existing_visit_charge_sales_order=lambda *a:None,_line_amount=lambda r:flt(r.get("amount")),_setup_total_amount=lambda s:sum(r.amount for r in s.services))
        run=load_function("daily_patient_visit.py","_covered_daily_amount",env)
        self.cover.side_effect=lambda doc,template=None,**k:self.decision if template=="THERAPY" else None
        self.assertEqual(run(self.doc,42,"2026-11-20",setup),(12,True))
        self.cover.side_effect=None
        self.assertEqual(run(self.doc,42,"2026-11-20",setup),(0,True))
        self.assertEqual([r.amount for r in setup.services],[30,12])

    def test_daily_catch_up_skips_bill_but_retains_clinical_visit(self):
        self.doc=Record(doctype="Patient Visit",name="VISIT",patient="PAT",inpatient_record="ADM")
        self.frappe.get_doc.return_value=self.doc
        env=dict(self.env,visit_type_no_charges=lambda t:False,DAILY_AUTO_VISIT_TYPE="Daily Auto Visit",
            _resolve_setup_cost_center=lambda *a:None,_setup_total_amount=lambda s:30,
            _covered_daily_amount=lambda *a:(0,True),add_op_charge_to_patient_visit=MagicMock(),
            create_daily_auto_visit_sales_order=MagicMock(),maybe_create_patient_visit_charge_sales_order=MagicMock())
        run=load_function("daily_patient_visit.py","_ensure_daily_auto_visit_billing",env)
        self.assertTrue(run(Record(),"VISIT","2026-11-20")["covered_by_package"])
        env["add_op_charge_to_patient_visit"].assert_not_called()
        env["create_daily_auto_visit_sales_order"].assert_not_called()


if __name__=="__main__":unittest.main()
