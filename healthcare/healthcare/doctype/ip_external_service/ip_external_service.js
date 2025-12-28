frappe.ui.form.on('IP External Service', {
	refresh(frm) {
		calculate_total_amount(frm);
	}
});

frappe.ui.form.on('IP External Trip Service', {
	amount(frm, cdt, cdn) {
		calculate_total_amount(frm);
	},
	ip_external_trip_service_remove(frm) {
		calculate_total_amount(frm);
	},
	services_add(frm, cdt, cdn) {
		set_child_date_from_header(frm, cdt, cdn);
	}
});

function calculate_total_amount(frm) {
	let total = 0;

	(frm.doc.services || []).forEach(row => {
		if (row.amount) {
			total += flt(row.amount);
		}
	});

	frm.set_value('total_amount', total);
}

function set_child_date_from_header(frm, cdt, cdn) {
	if (!frm.doc.trip_date) {
		return;
	}

	const row = frappe.get_doc(cdt, cdn);
	if (!row.date) {
		row.date = frm.doc.trip_date;
		frm.refresh_field('services');
	}
}







