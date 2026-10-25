// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

const LEGACY_CODE_ROLES = ['System Manager', 'Healthcare Administrator'];

function can_update_legacy_codes() {
	return LEGACY_CODE_ROLES.some((role) => frappe.user.has_role(role));
}

function upload_legacy_codes_document(on_done) {
	new frappe.ui.FileUploader({
		dialog_title: __('Upload Visit Types Reference'),
		allow_multiple: false,
		restrictions: { allowed_file_types: ['.docx'] },
		on_success(file) {
			frappe.call({
				method: 'healthcare.api.patient_visit_type_legacy.import_legacy_codes_from_document',
				args: { file_url: file.file_url },
				freeze: true,
				freeze_message: __('Updating legacy codes…'),
				callback(r) {
					const result = r.message || {};
					const lines = [
						__('Visit types read from document: {0}', [result.rows_in_document || 0]),
						__('Updated: {0}', [result.updated_count || 0]),
						__('Already correct: {0}', [result.unchanged_count || 0]),
					];
					if ((result.unmatched || []).length) {
						lines.push(
							__('Not found in Patient Visit Type: {0}', [
								result.unmatched.map((row) => `${row.name} (${row.code})`).join(', '),
							])
						);
					}
					if ((result.conflicts || []).length) {
						lines.push(
							__('Skipped (matches more than one type): {0}', [
								result.conflicts.map((row) => `${row.name} (${row.code})`).join(', '),
							])
						);
					}
					frappe.msgprint({
						title: __('Legacy Codes Updated'),
						indicator: 'green',
						message: lines.join('<br>'),
					});
					if (on_done) {
						on_done();
					}
				},
			});
		},
	});
}

frappe.ui.form.on('Patient Visit Type', {
	refresh(frm) {
		if (frm.is_new() || !can_update_legacy_codes()) {
			return;
		}
		frm.add_custom_button(
			__('Upload Legacy Codes'),
			() => upload_legacy_codes_document(() => frm.reload_doc()),
			__('Data Migration')
		);
	},
});
