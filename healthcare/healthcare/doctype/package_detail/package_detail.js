frappe.ui.form.on('Package Detail', {
	from_date: function (frm) {
		set_total_days(frm);
	},
	to_date: function (frm) {
		set_total_days(frm);
	}
});

function set_total_days(frm) {
	if (frm.doc.from_date && frm.doc.to_date) {
		const from_date = frappe.datetime.str_to_obj(frm.doc.from_date);
		const to_date = frappe.datetime.str_to_obj(frm.doc.to_date);

		if (to_date >= from_date) {
			const diff = frappe.datetime.get_day_diff(to_date, from_date);
			frm.set_value('total_days', diff);
		} else {
			frm.set_value('total_days', null);
		}
	}
}
















