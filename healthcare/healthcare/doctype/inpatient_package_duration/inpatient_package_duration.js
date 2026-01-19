frappe.ui.form.on('Inpatient Package', {
  refresh(frm) {
    // no-op; this script is for child table events
  }
});

frappe.ui.form.on('Inpatient Package Duration', {
  duration_class(frm, cdt, cdn) {
    const row = frappe.get_doc(cdt, cdn);
    if (!row.duration_class) {
      return;
    }

    frappe.db.get_value(
      'Package Duration Class',
      row.duration_class,
      ['from_day', 'to_day'],
      (r) => {
        if (!r) return;
        frappe.model.set_value(cdt, cdn, 'from_day', r.from_day);
        frappe.model.set_value(cdt, cdn, 'to_day', r.to_day);
      }
    );
  }
});

