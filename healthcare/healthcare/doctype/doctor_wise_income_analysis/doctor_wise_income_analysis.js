// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctor Wise Income Analysis", {
	refresh(frm) {
		render_print_preview(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Generate Analysis"), () => {
				frm.call({
					doc: frm.doc,
					method: "generate_analysis",
					freeze: true,
					freeze_message: __("Generating Doctor Wise Income Analysis..."),
					callback(r) {
						frm.reload_doc().then(() => {
							if (r.message && r.message.message) {
								frappe.show_alert({ message: r.message.message, indicator: "green" });
							}
							render_print_preview(frm);
						});
					},
				});
			}).addClass("btn-primary");

			if ((frm.doc.rows || []).length) {
				frm.add_custom_button(__("Print Analysis"), () => {
					frappe.utils.print(
						"Doctor Wise Income Analysis",
						frm.doc.name,
						"Doctor Wise Income Analysis"
					);
				});
			}
		}
	},

	from_date(frm) {
		set_default_years(frm);
	},

	to_date(frm) {
		set_default_years(frm);
	},
});

function set_default_years(frm) {
	if (!frm.doc.to_date) return;
	const y = frappe.datetime.str_to_obj(frm.doc.to_date).getFullYear();
	frm.set_value("year_1", y);
	frm.set_value("year_2", y - 1);
	frm.set_value("year_3", y - 2);
}

function render_print_preview(frm) {
	const wrap = frm.fields_dict.print_html;
	if (!wrap || !wrap.$wrapper) return;
	if (!(frm.doc.rows || []).length) {
		wrap.$wrapper.html(
			`<div class="text-muted">${__("Generate analysis to preview the Serene-style report.")}</div>`
		);
		return;
	}
	frappe.call({
		method: "healthcare.api.doctor_wise_income_analysis.render_doctor_wise_income_analysis",
		args: { doc: frm.doc.name },
		callback(r) {
			if (r.message) {
				wrap.$wrapper.html(r.message);
			}
		},
	});
}
