"""IP Mental State PDF (nursing portal PDF button)."""

from __future__ import annotations

import frappe

from healthcare.api.nursing_print import (
	MAROON,
	assert_nursing_print_permission,
	esc,
	fmt_date,
	fmt_time,
	form_footer_html,
	g,
	get_doc_letter_head,
	in_date_range,
	parse_datetime,
	patient_info_html,
	patient_meta,
	weekday,
	wrap_print_document,
)

_FORM_CODE = "SPHMD/N/MSE_29 MARCH 2020"
_TITLE = "IP MENTAL STATE"

_MS_FIELDS = [
	"name",
	"admission_no",
	"file_no",
	"patient_name",
	"branch",
	"trans_shift",
	"normal_at",
	"cooperative",
	"aggressive",
	"paranoid",
	"demanding",
	"preoccupied",
	"defence",
	"impulsive",
	"sedative",
	"normal_s",
	"rapid",
	"slow",
	"poor_sp",
	"slurred",
	"coherent",
	"incoherent",
	"talkative",
	"anxious",
	"angry",
	"depressed",
	"elated",
	"euthymic",
	"irritable",
	"twitches",
	"hyperactive",
	"stereotypes",
	"restless",
	"gait",
	"tics",
	"agitated",
	"abnormal",
	"hallucinatory_behaviour",
	"normal",
	"place",
	"time",
	"person",
	"normal_ap",
	"increased",
	"poor_ap",
	"reported",
	"non_reported",
	"normal_b",
	"reported_type",
	"sleep_duration",
	"normal_sleep",
	"disturbed",
	"intermittent",
	"excessive",
	"a_little",
	"conscious",
	"alert",
	"disturbed_con",
	"delusion",
	"dellusion",
	"perception",
	"creation",
	"modified",
	"owner",
]

_ATTITUDE = (
	("cooperative", "COOPERATIVE"),
	("aggressive", "AGGRESSIVE"),
	("paranoid", "PARANOID"),
	("demanding", "DEMANDING"),
	("preoccupied", "PREOCCUPIED"),
	("defence", "DEFENCE"),
	("impulsive", "IMPULSIVE"),
	("sedative", "SEDATIVE"),
)
_SPEECH = (
	("normal_s", "NORMAL"),
	("rapid", "RAPID"),
	("slow", "SLOW"),
	("poor_sp", "POOR"),
	("slurred", "SLURRED"),
	("coherent", "COHERENT"),
	("incoherent", "INCOHERENT"),
	("talkative", "TALKATIVE"),
)
_MOOD = (
	("euthymic", "EUTHYMIC"),
	("anxious", "ANXIOUS"),
	("angry", "ANGRY"),
	("depressed", "DEPRESSED"),
	("elated", "ELATED"),
	("irritable", "IRRITABLE"),
)
_BEHAVIOUR = (
	("normal", "Normal"),
	("twitches", "Twitches"),
	("hyperactive", "Hyperactive"),
	("stereotypes", "Stereotypes"),
	("restless", "Restless"),
	("gait", "Gait"),
	("tics", "Tics"),
	("agitated", "Agitated"),
	("abnormal", "Abnormal"),
	("hallucinatory_behaviour", "Hallucinatory"),
)
_SLEEP = (
	("normal_sleep", "Normal Sleep"),
	("disturbed", "Disturbed"),
	("intermittent", "Intermittent"),
	("excessive", "Excessive"),
	("a_little", "A Little"),
)


def _on(row, field) -> bool:
	value = row.get(field) if isinstance(row, dict) else g(row, field)
	if value in (None, "", 0, "0", False, "None"):
		return False
	text = str(value).strip().upper()
	return text not in {"N", "NO", "FALSE"}


def _stack(labels: list[str]) -> str:
	return "<br>".join(esc(x) for x in labels if x)


def _flags(row, pairs) -> str:
	return _stack([label for field, label in pairs if _on(row, field)])


def _shift_label(row) -> str:
	shift = g(row, "trans_shift") if not isinstance(row, dict) else row.get("trans_shift")
	try:
		n = int(shift) if shift not in (None, "") else None
	except (TypeError, ValueError):
		n = None
	if n == 1:
		return "Morning"
	if n == 2:
		return "Evening"
	if n == 3:
		return "Night"

	dt = parse_datetime(row.get("creation") if isinstance(row, dict) else g(row, "creation"))
	if not dt:
		return ""
	hour = dt.hour
	if 6 <= hour < 14:
		return "Morning"
	if 14 <= hour < 22:
		return "Evening"
	return "Night"


def _attitude(row) -> str:
	parts = []
	normal_at = row.get("normal_at") if isinstance(row, dict) else g(row, "normal_at")
	if normal_at:
		parts.append(str(normal_at).strip())
	parts.extend(label for field, label in _ATTITUDE if _on(row, field))
	return _stack(parts) if parts else "NORMAL"


def _orientation(row) -> str:
	order = (("place", "PLACE"), ("person", "PERSON"), ("time", "TIME"))
	return _flags(row, order)


def _appetite(row) -> str:
	parts = []
	if _on(row, "normal_ap") or _on(row, "normal_b"):
		parts.append("NORMAL")
	if _on(row, "increased"):
		parts.append("INCREASED")
	if _on(row, "poor_ap"):
		parts.append("POOR")
	return _stack(parts)


def _delusion(row) -> str:
	parts = []
	if _on(row, "non_reported"):
		parts.append("NON_REPORTED")
	if _on(row, "reported"):
		parts.append("REPORTED")
	rtype = row.get("reported_type") if isinstance(row, dict) else g(row, "reported_type")
	if rtype:
		parts.append(str(rtype).strip())
	if _on(row, "delusion") or _on(row, "dellusion"):
		parts.append("DELUSION")
	return _stack(parts) if parts else "NON_REPORTED"


def _perception(row) -> str:
	return "Yes" if _on(row, "perception") else "No"


def _consciousness(row) -> str:
	parts = []
	if _on(row, "conscious"):
		parts.append("Consious")
	if _on(row, "alert"):
		parts.append("Alert")
	if _on(row, "disturbed_con"):
		parts.append("Disturbed")
	return _stack(parts)


def care_plan_mental_html(row) -> str:
	"""Compact stacked summary used on the Nursing Care Plan."""
	if not row:
		return ""
	blocks = []
	orient = _orientation(row)
	if orient:
		blocks.append(orient)
	cons = _consciousness(row)
	if cons:
		blocks.append(cons)
	speech = _flags(row, _SPEECH)
	if speech:
		blocks.append(speech)
	att = _attitude(row)
	if att:
		blocks.append(att)
	beh = _flags(row, _BEHAVIOUR) or "Normal"
	blocks.append(beh)
	mood = _flags(row, _MOOD)
	if mood:
		blocks.append(mood)
	perc = "NO" if not _on(row, "perception") else "YES"
	blocks.append(f"Hallucinatory Behaviour - {esc(perc)}")
	blocks.append(_delusion(row) or "NON_REPORTED")
	return "<br>".join(blocks)


def _sleep(row) -> str:
	text = _flags(row, _SLEEP)
	duration = row.get("sleep_duration") if isinstance(row, dict) else g(row, "sleep_duration")
	if duration not in (None, "", 0, "0"):
		text = (text + "<br>" if text else "") + esc(f"{duration} hrs")
	return text or "Normal Sleep"


def _nurse(row) -> str:
	owner = row.get("owner") if isinstance(row, dict) else g(row, "owner")
	if not owner:
		return ""
	name = frappe.db.get_value("User", owner, "full_name")
	return str(name or owner).upper()


def _when(row):
	return row.get("creation") if isinstance(row, dict) else g(row, "creation")


def _date_time(when) -> str:
	d = fmt_date(when, "%d/%m/%y")
	t = fmt_time(when)
	if d and t:
		return f"{d} {t}"
	return d or t


def _load_rows(doc, date_from=None, date_to=None) -> list:
	admission = g(doc, "admission_no")
	patient = g(doc, "file_no")
	filters = {}
	if admission:
		filters["admission_no"] = admission
	elif patient:
		filters["file_no"] = patient
	else:
		return [doc.as_dict() if hasattr(doc, "as_dict") else doc]

	rows = frappe.get_all(
		"Mental State",
		filters=filters,
		fields=_MS_FIELDS,
		order_by="creation asc",
		limit=800,
	)
	if not rows:
		return [doc.as_dict() if hasattr(doc, "as_dict") else doc]

	if date_from or date_to:
		rows = [r for r in rows if in_date_range(r.get("creation"), date_from, date_to)]
	return rows


def _td(html, extra="") -> str:
	cls = f' class="{extra}"' if extra else ""
	return f"<td{cls}>{html}</td>"


def _mse_table(rows: list) -> str:
	body = []
	for row in rows:
		when = _when(row)
		cells = [
			_td(esc(_date_time(when)), "mse-c mse-nowrap"),
			_td(esc(weekday(when)), "mse-c mse-nowrap"),
			_td(esc(_shift_label(row)), "mse-c"),
			_td(_attitude(row), "mse-c"),
			_td(_flags(row, _SPEECH) or "NORMAL", "mse-c"),
			_td(_flags(row, _MOOD), "mse-c"),
			_td(_flags(row, _BEHAVIOUR) or "Normal", "mse-c"),
			_td(esc(_perception(row)), "mse-c"),
			_td(_orientation(row), "mse-c"),
			_td(_appetite(row), "mse-c"),
			_td(_delusion(row), "mse-c"),
			_td(_sleep(row), "mse-c"),
			_td(_consciousness(row), "mse-c"),
			_td(esc(_nurse(row)), "mse-c"),
		]
		body.append(f"<tr>{''.join(cells)}</tr>")

	if not body:
		body.append('<tr><td colspan="14" class="mse-c" style="height:24px;"></td></tr>')

	headers = [
		"Date Time",
		"Day",
		"Shift",
		"Attitude",
		"Speech",
		"MOOD",
		"Behaviour",
		"Perception",
		"Orientation",
		"Appetite",
		"Delusion",
		"Sleep",
		"Consiousness",
		"Nurse",
	]
	head = "".join(f'<th>{esc(h)}</th>' for h in headers)
	return f"""
	<table class="mse-table">
		<thead><tr>{head}</tr></thead>
		<tbody>{''.join(body)}</tbody>
	</table>
	"""


_MSE_CSS = f"""
		.mse-report {{
			font-family: Arial, Helvetica, sans-serif;
			color: #000;
			font-size: 10px;
			width: 100%;
			-webkit-print-color-adjust: exact !important;
			print-color-adjust: exact !important;
		}}
		.mse-table {{
			width: 100%;
			border-collapse: collapse;
			table-layout: fixed;
			margin-top: 2px;
		}}
		.mse-table th, .mse-table td {{
			border: 1px solid #000;
			padding: 3px 3px;
			font-size: 9px;
			vertical-align: top;
		}}
		.mse-table th {{
			color: {MAROON} !important;
			font-weight: bold;
			text-align: center;
			background: #fff;
		}}
		.mse-c {{ text-align: center; }}
		.mse-nowrap {{ white-space: nowrap; }}
		.mse-table th:first-child, .mse-table td:first-child {{ width: 10%; }}
"""


def render_ip_mental_state(doc, date_from=None, date_to=None):
	if isinstance(doc, str):
		doc = frappe.get_doc("Mental State", doc)
	rows = _load_rows(doc, date_from=date_from, date_to=date_to)
	meta = patient_meta(doc)
	return (
		f'<div class="mse-report">'
		f"{patient_info_html(meta)}"
		f"{_mse_table(rows)}"
		f"{form_footer_html(_FORM_CODE)}"
		f"</div>"
	)


def _seed_docs(name=None, patient=None):
	name = (name or "").strip()
	patient = (patient or "").strip()
	if patient:
		rows = frappe.get_all(
			"Mental State",
			filters={"file_no": patient},
			fields=["name", "admission_no"],
			order_by="creation desc",
			limit=800,
		)
		seen = set()
		seeds = []
		for row in rows:
			key = row.get("admission_no") or row.get("name")
			if not key or key in seen:
				continue
			seen.add(key)
			seeds.append(frappe.get_doc("Mental State", row.name))
		if seeds:
			return seeds
	if name and frappe.db.exists("Mental State", name):
		return [frappe.get_doc("Mental State", name)]
	return []


@frappe.whitelist()
def get_mental_state_html(name=None, patient=None, date_from=None, date_to=None):
	assert_nursing_print_permission("Mental State")

	seeds = _seed_docs(name, patient)
	if not seeds:
		frappe.throw(frappe._("No mental state records found to print"))

	bodies = [render_ip_mental_state(seed, date_from=date_from, date_to=date_to) for seed in seeds]
	if not bodies:
		frappe.throw(frappe._("No mental state records found to print"))

	return wrap_print_document(
		_TITLE,
		'<div class="np-page-break"></div>'.join(bodies),
		get_doc_letter_head(seeds[0]),
		extra_css=_MSE_CSS,
		landscape=True,
	)
