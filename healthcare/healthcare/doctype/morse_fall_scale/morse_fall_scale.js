// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Morse Fall Scale', {
	refresh: function(frm) {
		// Calculate total points on refresh
		calculate_total_points(frm);
	}
});

frappe.ui.form.on('Morse Fall Scale Detail', {
	points: function(frm, cdt, cdn) {
		calculate_total_points(frm);
	},
	morse_fall_scale_detail_remove: function(frm) {
		calculate_total_points(frm);
	},
	morse_fall_scale_detail_add: function(frm) {
		// Calculate when new row is added
		setTimeout(function() {
			calculate_total_points(frm);
		}, 100);
	}
});

function calculate_total_points(frm) {
	let total = 0;
	if (frm.doc.morse_fall_scale_detail) {
		frm.doc.morse_fall_scale_detail.forEach(function(row) {
			if (row.points) {
				total += flt(row.points);
			}
		});
	}
	frm.set_value('total_points', total);
	frm.refresh_field('total_points');
}








