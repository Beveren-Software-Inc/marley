// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Legacy Sales Transactions', {
	refresh(frm) {
		frm.set_query('item', 'items', () => ({
			filters: {},
		}));
	},
});
