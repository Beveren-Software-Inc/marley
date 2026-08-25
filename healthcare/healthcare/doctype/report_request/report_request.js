frappe.ui.form.on('Report Request', {
	patient(frm) {
		if (!frm.doc.patient) return
		frappe.db.get_value('Patient', frm.doc.patient, ['patient_name', 'file_no', 'uid'], (r) => {
			if (!r) return
			frm.set_value('patient_name', r.patient_name)
			frm.set_value('file_no', r.file_no)
			frm.set_value('id_number', r.uid)
		})
	},
})
