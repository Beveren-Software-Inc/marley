"""Temporary probe - prints Oracle / ERPNext observation statistics. Not shipped."""

import frappe


def run():
	for name in ("1145", "1142", "1143", "1144", "1124", "511"):
		print(
			name,
			frappe.db.get_value(
				"Observation",
				name,
				[
					"trans_no",
					"patient",
					"patient_name",
					"admission_no",
					"obs_code",
					"observation_level",
					"obs_level",
					"start_date",
					"dc_date",
					"note",
					"cost_center",
					"serv_amount",
					"amount",
					"duration",
					"status",
					"docstatus",
				],
				as_dict=True,
			),
		)

	erp = frappe.db.sql(
		"SELECT name, ifnull(trans_no,'') trans_no, ifnull(patient,'') patient,"
		" ifnull(admission_no,'') admission_no, ifnull(obs_code,'') obs_code,"
		" ifnull(observation_level,'') observation_level, ifnull(obs_level,'') obs_level,"
		" ifnull(start_date,'') start_date, ifnull(dc_date,'') dc_date,"
		" ifnull(note,'') note, ifnull(cost_center,'') cost_center,"
		" ifnull(serv_amount,0) serv_amount, ifnull(amount,0) amount,"
		" ifnull(duration,'') duration, docstatus, ifnull(invoiced,0) invoiced,"
		" ifnull(service_request,'') service_request, ifnull(order_created,'') order_created,"
		" ifnull(sales_invoice,'') sales_invoice"
		" FROM tabObservation",
		as_dict=True,
	)
	print("oracle", len(oracle), "erp", len(erp))
	keys_oracle = set(oracle)
	keys_erp = {(row["trans_no"] or row["name"]) for row in erp}
	print("missing in erp:", len(keys_oracle - keys_erp), sorted(keys_oracle - keys_erp)[:10])
	print("extra in erp:", len(keys_erp - keys_oracle), sorted(keys_erp - keys_oracle)[:10])
	print("name != trans_no:", sum(1 for r in erp if r["name"] != r["trans_no"]))

	blank_level_in_oracle = [
		r for r in erp if not r["observation_level"] and oracle.get(r["trans_no"], {}).get("OBS_CODE")
	]
	print("blank level but Oracle has code:", len(blank_level_in_oracle), [r["trans_no"] for r in blank_level_in_oracle][:10])
	blank_code = [r for r in erp if not r["obs_code"]]
	print("blank obs_code:", len(blank_code), [(r["trans_no"], oracle.get(r["trans_no"], {}).get("OBS_CODE")) for r in blank_code][:10])
	print(
		"serv_amount 0 < oracle:",
		sum(
			1
			for r in erp
			if not r["serv_amount"]
			and oracle.get(r["trans_no"], {}).get("SERV_AMT") not in (None, "", "0")
		),
	)
	print(
		"amount 0 < oracle:",
		sum(
			1
			for r in erp
			if not r["amount"] and oracle.get(r["trans_no"], {}).get("SERV_AMT") not in (None, "", "0")
		),
	)
	print(
		"blank dc_date but oracle has:",
		sum(1 for r in erp if not r["dc_date"] and oracle.get(r["trans_no"], {}).get("DC_DATE")),
	)
	print(
		"blank note but oracle has:",
		sum(1 for r in erp if not r["note"] and (oracle.get(r["trans_no"], {}).get("NOTES") or "").strip()),
	)
	print(
		"blank start_date but oracle has:",
		sum(1 for r in erp if not r["start_date"] and oracle.get(r["trans_no"], {}).get("START_DATE")),
	)
	print(
		"blank cost_center:",
		sum(1 for r in erp if not r["cost_center"]),
		"blank duration:",
		sum(1 for r in erp if not r["duration"]),
	)
	print(
		"protected:",
		sum(
			1
			for r in erp
			if r["invoiced"] or r["service_request"] or r["order_created"] or r["sales_invoice"]
		),
	)
	groups = {}
	for r in erp:
		key = (r["patient"], r["observation_level"], str(r["start_date"])[:10])
		groups.setdefault(key, []).append(r)
	print(
		"dup groups:",
		[
			(key, [row["name"] for row in rows])
			for key, rows in groups.items()
			if len(rows) > 1 and any(row["trans_no"] in keys_oracle for row in rows)
		][:10],
	)


	print("ERP observations:", frappe.db.count("Observation"))
	print("docstatus:", frappe.db.sql("SELECT docstatus, COUNT(*) c FROM tabObservation GROUP BY docstatus"))
	q = frappe.db.sql
	print("blank trans_no:", q("SELECT COUNT(*) c FROM tabObservation WHERE IFNULL(trans_no,'')=''")[0][0])
	print("name<>trans_no:", q("SELECT COUNT(*) c FROM tabObservation WHERE name <> IFNULL(trans_no,'')")[0][0])
	for field in (
		"patient",
		"admission_no",
		"observation_level",
		"obs_code",
		"obs_level",
		"start_date",
		"dc_date",
		"cost_center",
		"company",
		"note",
		"room",
		"healthcare_practitioner",
		"serv_amount",
		"amount",
		"duration",
	):
		print(f"blank {field}:", q(f"SELECT COUNT(*) c FROM tabObservation WHERE IFNULL({field},'')=''")[0][0])
	print(
		"samples:",
		q(
			"SELECT name, trans_no, patient, admission_no, obs_code, observation_level, obs_level,"
			" start_date, dc_date, docstatus, serv_amount, amount, cr_id, cr_date, up_id, up_date"
			" FROM tabObservation ORDER BY creation DESC LIMIT 5",
			as_dict=True,
		),
	)
