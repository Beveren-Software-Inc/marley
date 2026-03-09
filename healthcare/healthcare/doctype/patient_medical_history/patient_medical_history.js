// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Patient Medical History', {
  template(frm) {
    // If template is cleared, also clear history details
    if (!frm.doc.template) {
      frm.clear_table('patient_history_details');
      frm.refresh_field('patient_history_details');
      return;
    }

    // Fetch selected template and copy its child rows into this document
    frappe.db.get_doc('Patient Health History Template', frm.doc.template)
      .then(doc => {
        frm.clear_table('patient_history_details');

        (doc.patient_history_details || []).forEach(row => {
          const child = frm.add_child('patient_history_details');
          child.attributes = row.attributes;
          child.description = row.description;
          child.yesno = row.yesno;
        });

        frm.refresh_field('patient_history_details');
      })
      .catch(() => {
        frappe.msgprint({
          title: __('Template Load Failed'),
          message: __('Could not load Patient Health History Template {0}.', [frm.doc.template]),
          indicator: 'red'
        });
      });
  }
});

