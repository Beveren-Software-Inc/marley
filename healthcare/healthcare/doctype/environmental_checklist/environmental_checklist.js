// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Environmental Checklist', {
	environmental_checklist_template(frm) {
		if (frm.doc.environmental_checklist_template) {
			load_environmental_checklist_template(frm);
		} else {
			frm.clear_table('environmental_checklist_detail');
			frm.refresh_field('environmental_checklist_detail');
		}
	},
});

function load_environmental_checklist_template(frm) {
	if (!frm.doc.environmental_checklist_template) {
		return;
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Environmental Checklist Template',
			name: frm.doc.environmental_checklist_template,
		},
		callback(r) {
			if (r.message && r.message.checklist_items) {
				frm.clear_table('environmental_checklist_detail');
				r.message.checklist_items.forEach((item) => {
					const row = frm.add_child('environmental_checklist_detail');
					row.item_name = item.item_name;
					row.checked = 0;
				});
				frm.refresh_field('environmental_checklist_detail');
			}
		},
	});
}
