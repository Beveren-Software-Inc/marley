// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Consultation Fee', {
	refresh: function(frm) {
		// Calculate net amount on refresh
		calculate_net_amount(frm);
	},
	
	amount: function(frm) {
		calculate_net_amount(frm);
	},
	
	additional_amount: function(frm) {
		calculate_net_amount(frm);
	},
	
	discount_type: function(frm) {
		// Clear discount and discount_rate when type changes
		frm.set_value('discount', 0);
		frm.set_value('discount_rate', 0);
		calculate_net_amount(frm);
	},
	
	discount_rate: function(frm) {
		calculate_net_amount(frm);
	},
	
	discount: function(frm) {
		calculate_net_amount(frm);
	}
});

function calculate_net_amount(frm) {
	let amount = flt(frm.doc.amount) || 0;
	let additional_amount = flt(frm.doc.additional_amount) || 0;
	let discount_type = frm.doc.discount_type || 'Percentage';
	let net_amount = amount + additional_amount;
	
	if (discount_type === 'Percentage') {
		let discount_rate = flt(frm.doc.discount_rate) || 0;
		let discount_amount = (amount * discount_rate) / 100;
		net_amount = net_amount - discount_amount;
	} else if (discount_type === 'Amount') {
		let discount = flt(frm.doc.discount) || 0;
		net_amount = net_amount - discount;
	}
	
	frm.set_value('net_amount', net_amount);
	frm.refresh_field('net_amount');
}





