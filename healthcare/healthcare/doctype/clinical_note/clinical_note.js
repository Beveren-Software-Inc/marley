// Copyright (c) 2023, healthcare and contributors
// For license information, please see license.txt

const DOCTOR_PROGRESS_NOTE_TYPE = "Doctor Progress Note";
const NOTE_LOCK_ROLES = ["Administrator", "System Manager", "Healthcare Administrator"];

function can_lock_clinical_note() {
	return frappe.user.has_role(NOTE_LOCK_ROLES);
}

function is_doctor_progress_note(frm) {
	return frm.doc.clinical_note_type === DOCTOR_PROGRESS_NOTE_TYPE;
}

function apply_note_locked_state(frm) {
	frm.set_read_only();
	frm.disable_save();
	let intro = __("This Doctor Progress Note is locked. Editing is disabled.");
	if (frm.doc.locked_by) {
		intro += "<br>" + __("Locked by {0}", [frm.doc.locked_by]);
	}
	if (frm.doc.locked_on) {
		intro += "<br>" + __("Locked on {0}", [frappe.datetime.str_to_user(frm.doc.locked_on)]);
	}
	frm.set_intro(intro, true);
}

function lock_clinical_note(frm) {
	frappe.call({
		method: "healthcare.healthcare.doctype.clinical_note.clinical_note.lock_clinical_note",
		args: { name: frm.doc.name },
		freeze: true,
		callback(r) {
			if (!r.exc) {
				frappe.show_alert({ message: __("Note locked"), indicator: "green" });
				frm.reload_doc();
			}
		},
	});
}

frappe.ui.form.on("Clinical Note", {
	refresh(frm) {
		frm.set_intro("");

		if (frm.doc.note_locked) {
			apply_note_locked_state(frm);
			return;
		}

		if (!frm.is_new() && is_doctor_progress_note(frm) && can_lock_clinical_note()) {
			frm.add_custom_button(__("Lock Note"), () => {
				frappe.confirm(
					__(
						"Lock this Doctor Progress Note? It cannot be edited or deleted afterwards."
					),
					() => lock_clinical_note(frm)
				);
			}, __("Actions"));
		}
	},
	terms_and_conditions(frm) {
		set_terms_and_conditions(frm);
	},
});

var set_terms_and_conditions = function (frm, terms_and_conditions = "") {
	if (frm.doc.terms_and_conditions) {
		return frappe.call({
			method:
				"erpnext.setup.doctype.terms_and_conditions.terms_and_conditions.get_terms_and_conditions",
			args: {
				template_name: frm.doc.terms_and_conditions || terms_and_conditions,
				doc: frm.doc,
			},
			callback(r) {
				frm.set_value("note", r.message);
			},
		});
	}
	frm.set_value("note", "");
};
