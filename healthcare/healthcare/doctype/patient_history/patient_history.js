// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

function html_description_to_plain(html) {
	if (!html) {
		return "";
	}
	return String(html)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>\s*/gi, "\n")
		.replace(/<p[^>]*>/gi, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\r\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

frappe.ui.form.on("Patient History", {
	refresh(frm) {
		if (frm.is_new() && frm.doc.template && !(frm.doc.history_detail || []).length) {
			load_history_detail_from_template(frm);
		}

		const grid = frm.fields_dict.history_detail?.grid;
		if (grid && !grid.__ph_description_formatter) {
			grid.__ph_description_formatter = true;
			const formatter = (value) => html_description_to_plain(value);
			if (grid.formatters) {
				grid.formatters.description = formatter;
			} else {
				grid.formatters = { description: formatter };
			}
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

frappe.ui.form.on("Patient History Detail", {
	form_render(frm) {
		if (!frm.doc.description || !/<br/i.test(frm.doc.description)) {
			return;
		}
		frm.set_value("description", html_description_to_plain(frm.doc.description));
	},
});
