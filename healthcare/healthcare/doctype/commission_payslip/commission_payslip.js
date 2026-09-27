// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Commission Payslip", {
	refresh(frm) {
		if (frm.is_new()) return;

		if (healthcare_dcs) {
			frm.add_custom_button(
				__("View Statement"),
				() => show_payslip_statement(frm),
				__("View")
			);

			frm.add_custom_button(
				__("Print Statement"),
				() => {
					load_payslip_statement(frm, (data) => healthcare_dcs.print_statement(data));
				},
				__("View")
			);
		}

		// Due Payment sheet for this doctor — services still awaiting payment.
		frm.add_custom_button(
			__("Due Payment"),
			() => {
				frappe.utils.print("Commission Payslip", frm.doc.name, "Doctor Due Payment Payslip");
			},
			__("Print")
		);

		add_payment_entry_actions(frm);
	},
});

// ─── Pay the commission: Payment Entry against the payroll's Journal Entry ─────

function add_payment_entry_actions(frm) {
	// Already paid — link straight to the entry.
	if (frm.doc.payment_entry) {
		frm.add_custom_button(
			__("View Payment Entry"),
			() => frappe.set_route("Form", "Payment Entry", frm.doc.payment_entry),
			__("View")
		);
		return;
	}

	// Only a submitted payslip is approved for payment.
	if (frm.doc.docstatus !== 1) return;
	if (!flt(frm.doc.total_commission) || !frm.doc.doctor_commission_payroll) return;
	if (!frappe.model.can_create("Payment Entry")) return;

	// The commission payable is credited when the payroll is submitted, so pay only then.
	frappe.db
		.get_value("Doctor Commission Payroll", frm.doc.doctor_commission_payroll, "docstatus")
		.then((r) => {
			if (!r || cint(r.message.docstatus) !== 1) return;
			frm.add_custom_button(
				__("Create Payment Entry"),
				() => create_payment_entry(frm),
				__("Create")
			);
		});
}

function create_payment_entry(frm) {
	frappe.confirm(
		__("Create a Payment Entry paying {0} to {1}?", [
			format_currency(frm.doc.total_commission, frm.doc.currency),
			frm.doc.practitioner_name || frm.doc.practitioner,
		]),
		() => {
			frm.call({
				doc: frm.doc,
				method: "create_payment_entry",
				freeze: true,
				freeze_message: __("Creating Payment Entry..."),
				callback(r) {
					frm.reload_doc();
					if (!r.message) return;
					frappe.show_alert({
						message: __("Payment Entry {0} created.", [r.message.payment_entry]),
						indicator: "green",
					});
					frappe.set_route("Form", "Payment Entry", r.message.payment_entry);
				},
			});
		}
	);
}

function show_payslip_statement(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Commission Statement"),
		size: "extra-large",
		fields: [{ fieldname: "view_html", fieldtype: "HTML" }],
		secondary_action_label: __("Close"),
		secondary_action() {
			dialog.hide();
		},
	});

	dialog.add_custom_action(
		__("Print"),
		() => {
			if (!dialog._statement) {
				frappe.msgprint(__("Load the statement first."));
				return;
			}
			healthcare_dcs.print_statement(dialog._statement);
		},
		"btn-default"
	);

	dialog.show();
	load_payslip_statement(frm, (data) => {
		dialog._statement = data;
		dialog.fields_dict.view_html.$wrapper.html(healthcare_dcs.render_statement(data, false));
	});
}

function load_payslip_statement(frm, on_load) {
	frm.call({
		doc: frm.doc,
		method: "view_statement",
		freeze: true,
		freeze_message: __("Loading doctor commission statement..."),
		callback(r) {
			if (!r.message) return;
			on_load(r.message);
		},
	});
}
