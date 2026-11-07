"""Create missing IP Grooming Chart, Mental State, and Transfer Admission Event rows.

The Healthcare Settings buttons read the matching Oracle table (live, or from
an uploaded Excel export) and insert only the keys ERPNext does not already
have. Existing documents are left as they are.

* ``IP_GROOMING_CHART.TRANS_NUM`` -> ``IP Grooming Chart``
* ``IP_MENTAL_STATE.TRANS_NO`` -> ``Mental State`` (document name is the
  Oracle transaction number; desk rows named ``MS-...`` are not treated as
  those imports)
* ``IP_ADMISSION_TRANSFER.TRANS_NUM`` -> ``Transfer Admission Event``
"""

from __future__ import annotations

import time
from typing import Any, Callable

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, nowdate

from healthcare.api.discharge_checklist_import import _resolve_cost_center
from healthcare.api.ip_admission_transfer_import import (
	EXCEL_HEADER_MAP as TRANSFER_HEADER_MAP,
)
from healthcare.api.ip_admission_transfer_import import upsert_transfer_admission_event_from_row
from healthcare.api.ip_grooming_chart_import import (
	EXCEL_HEADER_MAP as GROOMING_HEADER_MAP,
)
from healthcare.api.ip_grooming_chart_import import upsert_ip_grooming_chart
from healthcare.api.oracle_excel_source import excel_source, normalize_files, oracle_schema
from healthcare.api.oracle_sync import _fetch_rows, _in_clause, _query, _sort_key
from healthcare.api.patient_info_import import _cell_text, _clean_oracle_num, _require_admin
from healthcare.api.visit_diagnosis_sync import _resolve_inpatient_admission

PROGRESS_TTL = 60 * 60 * 12
LOCK_TTL = 60 * 60 * 6
ERP_PAGE = 50000
IMPORT_CHUNK = 200
TIME_BUDGET = 15 * 60
SAMPLE_LIMIT = 15
ERROR_LIMIT = 5

MENTAL_CHECK_FIELDS = {
	"NORMAL_AT": None,
	"COOPERATIVE": "cooperative",
	"AGGRESSIVE": "aggressive",
	"PARANOID": "paranoid",
	"DEMANDING": "demanding",
	"PREOCCUPIED": "preoccupied",
	"DEFENSIVE": "defence",
	"IMPULSIVE": "impulsive",
	"SEDATIVE": "sedative",
	"NORMAL_S": "normal_s",
	"RAPID": "rapid",
	"SLOW": "slow",
	"POOR_SP": "poor_sp",
	"SLURRED": "slurred",
	"COHERENT": "coherent",
	"INCOHERENT": "incoherent",
	"TALKATIVE": "talkative",
	"ANXIOUS": "anxious",
	"ANGRY": "angry",
	"DEPRESSED": "depressed",
	"ELATED": "elated",
	"EUTHYMIC": "euthymic",
	"IRRITABLE": "irritable",
	"TWITCHES": "twitches",
	"HYPERACTIVE": "hyperactive",
	"STEREOTYPED": "stereotypes",
	"RESTLESS": "restless",
	"GAIT": "gait",
	"TICS": "tics",
	"AGITATAED": "agitated",
	"ABNORMAL": "abnormal",
	"HALLUCINATORY_BEHAVIOUR": "hallucinatory_behaviour",
	"PLACE": "place",
	"PERSON": "person",
	"TIME": "time",
	"NORMAL_AP": "normal_ap",
	"INCREASED": "increased",
	"POOR_AP": "poor_ap",
	"REPORTED": "reported",
	"NON_REPORTED": "non_reported",
	"NORMAL_B": "normal_b",
	"NORMAL_SLEEP": "normal_sleep",
	"DISTURBED": "disturbed",
	"INTERMITTENT": "intermittent",
	"EXCESSIVE": "excessive",
	"ALITTLE": "a_little",
	"CONSIOUS": "conscious",
	"ALERT": "alert",
	"DISTURBED_CON": "disturbed_con",
}


def _yn(value: Any) -> int:
	return 1 if str(value or "").strip().upper() in {"Y", "YES", "1", "TRUE"} else 0


def _mental_check_values(raw: dict) -> dict[str, int]:
	"""Oracle Y/N flags, including the columns whose names are misspelled."""
	values: dict[str, int] = {}
	for column, field in MENTAL_CHECK_FIELDS.items():
		if not field:
			continue
		if _yn(raw.get(column)):
			values[field] = 1
	return values


class _ChartSpec:
	def __init__(
		self,
		slug: str,
		title: str,
		table: str,
		doctype: str,
		key_column: str,
		link_columns: list[str],
		create: Callable[[dict], str],
	):
		self.slug = slug
		self.title = title
		self.table = table
		self.doctype = doctype
		self.key_column = key_column
		self.link_columns = link_columns
		self.create = create
		self.progress_key = f"healthcare:ip_chart_reconcile:{slug}:progress"
		self.work_key = f"healthcare:ip_chart_reconcile:{slug}:work"
		self.lock_key = f"healthcare:ip_chart_reconcile:{slug}:lock"


def _map_row(raw: dict, header_map: dict[str, str]) -> dict:
	return {header_map.get(name, (name or "").lower()): value for name, value in (raw or {}).items()}


def _create_grooming(raw: dict) -> str:
	row = _map_row(raw, GROOMING_HEADER_MAP)
	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return "skipped"
	if frappe.db.exists("IP Grooming Chart", trans_num) or frappe.db.exists(
		"IP Grooming Chart", {"trans_num": trans_num}
	):
		return "exists"
	result = upsert_ip_grooming_chart(row) or {}
	return "created" if result.get("status") == "created" else "skipped"


def _create_transfer(raw: dict) -> str:
	row = _map_row(raw, TRANSFER_HEADER_MAP)
	trans_num = _clean_oracle_num(row.get("trans_num"))
	if not trans_num:
		return "skipped"
	if frappe.db.exists("Transfer Admission Event", trans_num):
		return "exists"
	result = upsert_transfer_admission_event_from_row(row) or {}
	return "created" if result.get("status") == "created" else "skipped"


def _create_mental(raw: dict) -> str:
	trans_no = _clean_oracle_num(raw.get("TRANS_NO"))
	if not trans_no:
		return "skipped"
	if frappe.db.exists("Mental State", trans_no):
		return "exists"
	admission_num = _clean_oracle_num(raw.get("ADMISSION_NUM"))
	admission = _resolve_inpatient_admission(admission_num) if admission_num else None
	if not admission:
		return "skipped"
	patient = frappe.db.get_value("Inpatient Admission", admission, "patient")
	if not patient or not frappe.db.exists("Patient", patient):
		return "skipped"

	doc = frappe.new_doc("Mental State")
	doc.admission_no = admission
	doc.file_no = patient
	old = _clean_oracle_num(raw.get("ADMISSION_NUM_OLD"))
	if old:
		doc.admission_num_old = old
	if _cell_text(raw.get("TRANS_SHIFT")):
		doc.trans_shift = cint(raw.get("TRANS_SHIFT"))
	if _cell_text(raw.get("NORMAL_AT")):
		doc.normal_at = _cell_text(raw.get("NORMAL_AT"))
	if _cell_text(raw.get("REPORTED_TYPE")):
		doc.reported_type = _cell_text(raw.get("REPORTED_TYPE"))
	if _cell_text(raw.get("SLEEP_DURATION")):
		doc.sleep_duration = cint(raw.get("SLEEP_DURATION"))
	for field, value in _mental_check_values(raw).items():
		doc.set(field, value)
	branch = _resolve_cost_center(raw.get("BRANCH_NUM"))
	if branch:
		doc.branch = branch

	previous = bool(getattr(frappe.flags, "in_import", False))
	frappe.flags.in_import = True
	try:
		doc.name = trans_no
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)
	finally:
		frappe.flags.in_import = previous
	return "created"


GROOMING = _ChartSpec(
	"grooming_chart",
	"IP Grooming Chart",
	"IP_GROOMING_CHART",
	"IP Grooming Chart",
	"TRANS_NUM",
	["ADMISSION_NUM"],
	_create_grooming,
)
MENTAL = _ChartSpec(
	"mental_state",
	"IP Mental State",
	"IP_MENTAL_STATE",
	"Mental State",
	"TRANS_NO",
	["ADMISSION_NUM"],
	_create_mental,
)
TRANSFER = _ChartSpec(
	"admission_transfer",
	"IP Admission Transfer",
	"IP_ADMISSION_TRANSFER",
	"Transfer Admission Event",
	"TRANS_NUM",
	["PATIENT_NUM", "OLD_ADMISSION_NUM", "NEW_ADMISSION_NUM"],
	_create_transfer,
)


def _set_progress(spec: _ChartSpec, progress: dict) -> None:
	progress["updated_at"] = str(now_datetime())
	frappe.cache().set_value(spec.progress_key, progress, expires_in_sec=PROGRESS_TTL)


def _load_progress(spec: _ChartSpec) -> dict:
	return frappe.cache().get_value(spec.progress_key) or {}


def _set_work(spec: _ChartSpec, work: dict) -> None:
	frappe.cache().set_value(spec.work_key, work, expires_in_sec=PROGRESS_TTL)


def _load_work(spec: _ChartSpec) -> dict:
	return frappe.cache().get_value(spec.work_key) or {}


def _lock_name(spec: _ChartSpec) -> str:
	db_name = (frappe.local.conf or {}).get("db_name") or frappe.local.site
	return f"{db_name}|{spec.lock_key}"


def _acquire_lock(spec: _ChartSpec) -> str | None:
	token = frappe.generate_hash(length=12)
	if not frappe.cache().set(_lock_name(spec), token.encode(), nx=True, ex=LOCK_TTL):
		return None
	return token


def _owns_lock(spec: _ChartSpec, token: str | None) -> bool:
	if not token:
		return False
	return (frappe.cache().get(_lock_name(spec)) or b"").decode() == token


def _release_lock(spec: _ChartSpec) -> None:
	frappe.cache().delete(_lock_name(spec))


def _lock_held(spec: _ChartSpec) -> bool:
	return bool(frappe.cache().get(_lock_name(spec)))


def _record_error(progress: dict, error: str) -> None:
	text = str(error or "").strip()
	if not text:
		return
	progress["failed"] = cint(progress.get("failed")) + 1
	errors = progress.setdefault("errors", [])
	if len(errors) < ERROR_LIMIT:
		errors.append(text[:800])


def _record_sample(progress: dict, text: str) -> None:
	if not text or len(progress.get("samples") or []) >= SAMPLE_LIMIT:
		return
	progress.setdefault("samples", []).append(text)


def _oracle_index(spec: _ChartSpec) -> dict[str, list[str]]:
	columns = ", ".join([spec.key_column, *spec.link_columns])
	rows = _query(
		f"select {columns} from {oracle_schema()}.{spec.table} "
		f"where {spec.key_column} is not null"
	)
	index: dict[str, list[str]] = {}
	for row in rows or []:
		key = _clean_oracle_num(row.get(spec.key_column))
		if not key or key in index:
			continue
		links = []
		for column in spec.link_columns:
			value = _clean_oracle_num(row.get(column))
			if value and value not in links:
				links.append(value)
		index[key] = links
	return index


def _erp_keys(doctype: str) -> tuple[set[str], int]:
	keys: set[str] = set()
	total = 0
	after = ""
	while True:
		rows = frappe.db.sql(
			f"select name from `tab{doctype}` where name > %s order by name asc limit %s",
			(after, ERP_PAGE),
		)
		if not rows:
			break
		for (name,) in rows:
			after = name
			total += 1
			cleaned = _clean_oracle_num(name)
			if cleaned:
				keys.add(cleaned)
		if len(rows) < ERP_PAGE:
			break
	return keys, total


def _scope_keys(patient: str) -> set[str] | None:
	patient = (patient or "").strip()
	if not patient:
		return None
	keys = {_clean_oracle_num(patient)}
	rows = frappe.db.sql(
		"""
		select name, ifnull(case_no, ''), ifnull(admission_no_old, '')
		from `tabInpatient Admission`
		where patient = %s or name = %s
		""",
		(patient, patient),
	)
	for name, case_no, old in rows:
		for value in (name, case_no, old):
			cleaned = _clean_oracle_num(value)
			if cleaned:
				keys.add(cleaned)
	return {key for key in keys if key}


def _scan(spec: _ChartSpec) -> dict:
	oracle = _oracle_index(spec)
	erp, erp_count = _erp_keys(spec.doctype)
	missing: list[list] = []
	matched = 0
	for key in sorted(oracle, key=_sort_key):
		if key in erp:
			matched += 1
			continue
		missing.append([key, oracle[key]])
	return {
		"oracle_rows": len(oracle),
		"erpnext_rows": erp_count,
		"matched": matched,
		"missing": missing,
	}


def _work_items(scan: dict, patient: str = "", limit: int = 0) -> list[list]:
	scope = _scope_keys(patient)
	items = list(scan.get("missing") or [])
	if scope is not None:
		items = [item for item in items if scope.intersection(item[1])]
	if cint(limit):
		items = items[: cint(limit)]
	return items


def _sample_rows(spec: _ChartSpec, items: list[list]) -> list[dict]:
	samples = []
	for key, links in items[:10]:
		sample = {"key": key, "text": "create"}
		if spec.slug == "admission_transfer":
			if links:
				sample["patient"] = links[0]
		elif links:
			sample["admission"] = links[0]
		samples.append(sample)
	return samples


def _preview(spec: _ChartSpec, patient: str = "", files=None) -> dict[str, Any]:
	_require_admin()
	files = normalize_files(files)
	with excel_source(files, tables=[spec.table]) as source:
		scan = _scan(spec)
		items = _work_items(scan, patient=patient)
		result = {
			"ok": True,
			"as_of": str(nowdate()),
			"mode": "patient" if (patient or "").strip() else "site",
			"oracle_table": f"{oracle_schema()}.{spec.table}",
			"oracle_rows": scan["oracle_rows"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": len(items),
			"samples": _sample_rows(spec, items),
		}
		if source is not None:
			result["oracle_table"] = source.describe(spec.table)
	result["in_sync"] = not cint(result["missing_total"])
	return result


def _process_chunk(spec: _ChartSpec, items: list[list], progress: dict, dry_run: int) -> None:
	keys = [item[0] for item in items if item and item[0]]
	if not keys:
		return
	rows = _fetch_rows(spec.table, where=f"{spec.key_column} in ({_in_clause(keys)})")
	by_key = {}
	for raw in rows or []:
		key = _clean_oracle_num(raw.get(spec.key_column))
		if key and key not in by_key:
			by_key[key] = raw

	for key, _links in items:
		raw = by_key.get(key)
		if not raw:
			progress["skipped"] = cint(progress.get("skipped")) + 1
			continue
		if cint(dry_run):
			progress["created"] = cint(progress.get("created")) + 1
			_record_sample(progress, f"{key} · dry run")
			continue
		try:
			status = spec.create(raw)
			if status == "created":
				progress["created"] = cint(progress.get("created")) + 1
				_record_sample(progress, f"{key} · created")
			else:
				progress["skipped"] = cint(progress.get("skipped")) + 1
		except Exception:
			_record_error(progress, f"{key}: {frappe.get_traceback()}")
			frappe.db.rollback()


def _summary(spec: _ChartSpec, progress: dict) -> str:
	lines = [
		_("{0} reconcile finished.").format(spec.title),
		"",
		_("Oracle {0}").format(spec.table),
		_("Oracle rows: {0}").format(cint(progress.get("oracle_rows"))),
		_("Already in ERPNext: {0} ({1} matched)").format(
			cint(progress.get("erpnext_rows")), cint(progress.get("matched"))
		),
		_("Created: {0}").format(cint(progress.get("created"))),
		_("Skipped: {0}").format(cint(progress.get("skipped"))),
	]
	if progress.get("failed"):
		lines.extend(["", _("Failed: {0}").format(cint(progress.get("failed")))])
		for error in progress.get("errors") or []:
			lines.append(f"• {error}")
	for sample in progress.get("samples") or []:
		lines.append(f"• {sample}")
	return "\n".join(lines)


def _queue_next(spec: _ChartSpec, token: str, progress: dict, files) -> None:
	frappe.enqueue(
		f"healthcare.api.ip_chart_reconcile.run_{spec.slug}_reconcile",
		queue="long",
		timeout=7200,
		resume=1,
		token=token,
		dry_run=cint(progress.get("dry_run")),
		patient=progress.get("patient") or "",
		limit=cint(progress.get("limit")),
		files=files,
	)


def _run(
	spec: _ChartSpec,
	token: str,
	resume: int,
	limit: int,
	dry_run: int,
	patient: str,
	files,
) -> dict[str, Any]:
	started = time.monotonic()
	if cint(resume):
		progress = _load_progress(spec) or {}
		work = _load_work(spec) or {}
	else:
		scan = _scan(spec)
		items = _work_items(scan, patient=patient, limit=limit)
		progress = {
			"job_key": spec.slug,
			"state": "running",
			"dry_run": cint(dry_run),
			"patient": patient or "",
			"limit": cint(limit),
			"processed": 0,
			"total": len(items),
			"oracle_rows": scan["oracle_rows"],
			"erpnext_rows": scan["erpnext_rows"],
			"matched": scan["matched"],
			"missing_total": len(items),
			"created": 0,
			"skipped": 0,
			"failed": 0,
			"samples": [],
			"errors": [],
		}
		work = {"items": items, "offset": 0}
		_set_work(spec, work)
		_set_progress(spec, progress)

	items = work.get("items") or []
	offset = cint(work.get("offset"))
	while offset < len(items):
		if time.monotonic() - started > TIME_BUDGET:
			work["offset"] = offset
			_set_work(spec, work)
			progress["processed"] = offset
			progress["state"] = "running"
			progress["message"] = _("Created {0}. Continuing in the background.").format(
				cint(progress.get("created"))
			)
			_set_progress(spec, progress)
			_queue_next(spec, token, progress, files)
			return {"state": "queued", "handed_over": True, "progress": progress}

		chunk = items[offset : offset + IMPORT_CHUNK]
		_process_chunk(spec, chunk, progress, dry_run)
		offset += len(chunk)
		work["offset"] = offset
		progress["processed"] = offset
		progress["message"] = _("{0} of {1}").format(offset, len(items))
		_set_work(spec, work)
		_set_progress(spec, progress)
		frappe.db.commit()

	progress["processed"] = len(items)
	progress["state"] = "finished"
	progress["finished_at"] = str(now_datetime())
	progress["message"] = _summary(spec, progress)
	_set_progress(spec, progress)
	return {"state": "finished", "progress": progress}


def _start(spec: _ChartSpec, patient: str = "", limit: int = 0, dry_run: int = 0, files=None):
	_require_admin()
	files = normalize_files(files)
	if _lock_held(spec):
		return {
			"queued": False,
			"running": True,
			"message": _("This reconciliation is already running."),
			"status": _load_progress(spec),
		}
	progress = {
		"job_key": spec.slug,
		"state": "queued",
		"dry_run": cint(dry_run),
		"patient": patient or "",
		"limit": cint(limit),
		"processed": 0,
		"total": 0,
		"files": files,
		"message": (
			_("Queued. The uploaded Excel export is read in the background.")
			if files
			else _("Queued. Oracle is read in the background.")
		),
	}
	_set_progress(spec, progress)
	frappe.enqueue(
		f"healthcare.api.ip_chart_reconcile.run_{spec.slug}_reconcile",
		queue="long",
		timeout=7200,
		limit=cint(limit),
		dry_run=cint(dry_run),
		patient=patient or "",
		files=files,
	)
	return {"queued": True, "job_key": spec.slug, "status": progress}


def _status(spec: _ChartSpec) -> dict[str, Any]:
	_require_admin()
	return _load_progress(spec) or {"job_key": spec.slug, "state": "idle", "processed": 0, "total": 0}


def _execute(spec: _ChartSpec, limit=0, resume=0, token=None, dry_run=0, patient="", files=None):
	files = normalize_files(files)
	if cint(resume):
		if not _owns_lock(spec, token):
			return {"state": "skipped", "message": _("This reconciliation run was replaced by a newer one.")}
	else:
		token = _acquire_lock(spec)
		if not token:
			return {"state": "running", "message": _("This reconciliation is already running.")}

	outcome: dict[str, Any] = {}
	try:
		with excel_source(files, tables=[spec.table]):
			outcome = _run(spec, token, cint(resume), cint(limit), cint(dry_run), patient or "", files)
	except Exception:
		progress = _load_progress(spec) or {"job_key": spec.slug}
		progress["state"] = "failed"
		progress["message"] = frappe.get_traceback()
		_record_error(progress, frappe.get_traceback())
		_set_progress(spec, progress)
		frappe.log_error(title=f"{spec.title} reconciliation failed")
		raise
	finally:
		if not outcome.get("handed_over"):
			_release_lock(spec)
	return outcome


@frappe.whitelist()
def preview_grooming_chart_reconcile(patient: str = "", limit: int = 0, files=None):
	return _preview(GROOMING, patient=patient, files=files)


@frappe.whitelist()
def start_grooming_chart_reconcile(patient: str = "", limit: int = 0, dry_run: int = 0, files=None):
	return _start(GROOMING, patient=patient, limit=limit, dry_run=dry_run, files=files)


@frappe.whitelist()
def get_grooming_chart_reconcile_status():
	return _status(GROOMING)


def run_grooming_chart_reconcile(
	limit: int = 0, resume: int = 0, token: str | None = None, dry_run: int = 0, patient: str = "", files=None
):
	return _execute(GROOMING, limit, resume, token, dry_run, patient, files)


@frappe.whitelist()
def preview_mental_state_reconcile(patient: str = "", limit: int = 0, files=None):
	return _preview(MENTAL, patient=patient, files=files)


@frappe.whitelist()
def start_mental_state_reconcile(patient: str = "", limit: int = 0, dry_run: int = 0, files=None):
	return _start(MENTAL, patient=patient, limit=limit, dry_run=dry_run, files=files)


@frappe.whitelist()
def get_mental_state_reconcile_status():
	return _status(MENTAL)


def run_mental_state_reconcile(
	limit: int = 0, resume: int = 0, token: str | None = None, dry_run: int = 0, patient: str = "", files=None
):
	return _execute(MENTAL, limit, resume, token, dry_run, patient, files)


@frappe.whitelist()
def preview_admission_transfer_reconcile(patient: str = "", limit: int = 0, files=None):
	return _preview(TRANSFER, patient=patient, files=files)


@frappe.whitelist()
def start_admission_transfer_reconcile(
	patient: str = "", limit: int = 0, dry_run: int = 0, files=None
):
	return _start(TRANSFER, patient=patient, limit=limit, dry_run=dry_run, files=files)


@frappe.whitelist()
def get_admission_transfer_reconcile_status():
	return _status(TRANSFER)


def run_admission_transfer_reconcile(
	limit: int = 0, resume: int = 0, token: str | None = None, dry_run: int = 0, patient: str = "", files=None
):
	return _execute(TRANSFER, limit, resume, token, dry_run, patient, files)
