frappe.ui.form.on('IP Service', {
	refresh(frm) {
		calculate_total_amount(frm);
	}
});

frappe.ui.form.on('IP Service Detail', {
	amount(frm, cdt, cdn) {
		calculate_total_amount(frm);
	},
	services_remove(frm) {
		calculate_total_amount(frm);
	},
	services_add(frm, cdt, cdn) {
		row_default_date(frm, cdt, cdn);
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

function row_default_date(frm, cdt, cdn) {
	const row = frappe.get_doc(cdt, cdn);
	if (!row.date) {
		row.date = frappe.datetime.get_today();
		frm.refresh_field('services');
	}
}


















