// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient History", {
	refresh(frm) {
		if (frm.is_new() && frm.doc.template && !(frm.doc.history_detail || []).length) {
			load_history_detail_from_template(frm);
		}
	},

	template(frm) {
		if (frm.doc.template) {
			load_history_detail_from_template(frm);
			return;
		}
		frm.clear_table("history_detail");
		frm.refresh_field("history_detail");
	},
});

function load_history_detail_from_template(frm) {
	if (!frm.doc.template) {
		return;
	}

	frappe.call({
		method: "frappe.client.get",
		args: {
			doctype: "Patient History Template",
			name: frm.doc.template,
		},
		callback(r) {
			if (!r.message) {
				return;
			}

			const template = r.message;
			const rows = template.history_detail || [];

			frm.clear_table("history_detail");

			rows.forEach((row) => {
				const child = frm.add_child("history_detail");
				child.attribute = row.attribute || "";
				child.description = row.description || "";
				child.is_mendatory = row.is_mendatory ? 1 : 0;
				child.order_no = row.order_no || 0;
				child.attrib_num = row.attrib_num || 0;
			});

			frm.refresh_field("history_detail");

			if (rows.length) {
				frappe.show_alert({
					message: __("Loaded {0} item(s) from template", [rows.length]),
					indicator: "green",
				});
			} else {
				frappe.msgprint(__("Template has no history detail rows."));
			}
		},
	});
}
