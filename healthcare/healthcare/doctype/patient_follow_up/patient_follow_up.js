// Copyright (c) 2026, Healthcare and contributors
// License: GNU GPL v3

frappe.ui.form.on("Patient Follow Up", {
	refresh(frm) {
		if (!frm.doc.no_follow_up_required && frm.doc.docstatus === 0) {
			frm.add_custom_button(__("No need to follow up"), () => {
				frm.set_value("no_follow_up_required", 1);
				frm.set_value("status", "No Follow Up Required");
				frm.save();
			});
		}
	},
});
