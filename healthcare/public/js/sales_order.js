frappe.ui.form.on( "Sales Order", {

    patient(frm) {
        if (!frm.doc.patient) return;

        // Fetch customer having same name as patient
        frappe.db.get_value(
            "Customer",
            { name: frm.doc.patient },   // same ID assumption
            "name"
        ).then(r => {
                
            if (r.message && r.message.name) {
                frm.set_value("customer", r.message.name);
            } else {
                frappe.msgprint(
                    __("No Customer found matching Patient {0}", [frm.doc.patient])
                );
            }

        });
    }

});