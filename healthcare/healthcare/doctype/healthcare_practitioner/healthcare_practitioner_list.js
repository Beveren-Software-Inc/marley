// Copyright (c) 2026, Healthcare contributors
// For license information, please see license.txt
// Keep this upload flow in sync with healthcare_practitioner.js (form button).

(function () {
	const roles = ['System Manager', 'Healthcare Administrator'];

	function can_import_practitioner_names() {
		return roles.some((role) => frappe.user.has_role(role));
	}

	function practitioner_name_import_summary(preview) {
		const lines = [
			__('Names read from Excel: {0}', [preview.excel_rows || 0]),
			__('Practitioners to update: {0}', [preview.updatable || 0]),
			__('Matched by Employee Code: {0}', [preview.matched_by_employee_code || 0]),
			__('Matched by User Code: {0}', [preview.matched_by_user_code || 0]),
		];
		if (preview.matched_by_login_name) {
			lines.push(__('Matched by Login Name: {0}', [preview.matched_by_login_name]));
		}
		if (preview.unmatched_count) {
			lines.push(__('Not found in Excel: {0}', [preview.unmatched_count]));
		}
		if (preview.ambiguous_count) {
			lines.push(
				__('Skipped, conflicting names in Excel: {0}', [preview.ambiguous_count])
			);
		}
		return lines.join('<br>');
	}

	function practitioner_name_import_result(result) {
		const lines = [
			__('Updated: {0}', [result.updated || 0]),
			__('Matched by Employee Code: {0}', [result.matched_by_employee_code || 0]),
			__('Matched by User Code: {0}', [result.matched_by_user_code || 0]),
		];
		if (result.matched_by_login_name) {
			lines.push(__('Matched by Login Name: {0}', [result.matched_by_login_name]));
		}
		if ((result.unmatched || []).length) {
			lines.push(__('Not found in Excel: {0}', [result.unmatched.join(', ')]));
		}
		if ((result.ambiguous || []).length) {
			lines.push(
				__('Skipped, conflicting names in Excel: {0}', [result.ambiguous.join(', ')])
			);
		}
		frappe.msgprint({
			title: __('Practitioner Names Updated'),
			indicator: 'green',
			message: lines.join('<br>'),
		});
	}

	function upload_practitioner_name_list(on_done) {
		new frappe.ui.FileUploader({
			dialog_title: __('Upload Practitioner List'),
			allow_multiple: false,
			restrictions: { allowed_file_types: ['.xlsx', '.xls'] },
			on_success(file) {
				frappe.call({
					method: 'healthcare.api.practitioner_name_import.preview_practitioner_name_import',
					args: { file_url: file.file_url },
					freeze: true,
					freeze_message: __('Reading Excel…'),
					callback(r) {
						const preview = r.message || {};
						if (!preview.updatable) {
							frappe.msgprint({
								title: __('Nothing to Update'),
								indicator: 'orange',
								message: practitioner_name_import_summary(preview),
							});
							return;
						}
						frappe.confirm(
							__(
								'Update first name, last name and full name for {0} practitioner(s) without a full name?',
								[preview.updatable]
							) +
								'<br><br>' +
								practitioner_name_import_summary(preview),
							() => {
								frappe.call({
									method: 'healthcare.api.practitioner_name_import.run_practitioner_name_import',
									args: { file_url: file.file_url },
									freeze: true,
									freeze_message: __('Updating practitioner names…'),
									callback(res) {
										practitioner_name_import_result(res.message || {});
										if (on_done) {
											on_done();
										}
									},
								});
							}
						);
					},
				});
			},
		});
	}

	frappe.listview_settings['Healthcare Practitioner'] = {
		onload(listview) {
			if (!can_import_practitioner_names()) {
				return;
			}
			listview.page.add_menu_item(__('Update Names from Excel'), () =>
				upload_practitioner_name_list(() => listview.refresh())
			);
		},
	};
})();
