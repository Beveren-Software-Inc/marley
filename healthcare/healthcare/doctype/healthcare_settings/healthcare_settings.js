// Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Healthcare Settings', {
	refresh(frm) {
		if (!frappe.user.has_role('System Manager') && !frappe.user.has_role('Healthcare Administrator')) {
			return;
		}

		frm.add_custom_button(__('Migrate Patients (Category & Customer Group)'), () => {
			frappe.confirm(
				__(
					'Run in background: American Navy → Military, Royal → VIP, blank → Regular; All Customer Groups → Patient. Continue?'
				),
				() => run_migration_job(frm, 'start_patient_migration', 'patients')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Sync Customer Group from Category'), () => {
			frappe.confirm(
				__(
					'Run in background: for each Patient with a Category, set Customer Group to the same name (create the Customer Group if missing) and update the linked Customer. Patients without a category are skipped. Continue?'
				),
				() =>
					run_migration_job(
						frm,
						'start_patient_category_customer_group_sync',
						'patient_category_customer_group'
					)
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Discharge Scheduled Admissions'), () => {
			frappe.confirm(
				__(
					'Run in background: set all Inpatient Admissions with status “Admission Scheduled” to “Discharged”. This may take a long time for large datasets. Continue?'
				),
				() => run_migration_job(frm, 'start_admission_migration', 'admissions')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Submit All Draft Discharges'), () => {
			frappe.confirm(
				__(
					'Run in background: submit all draft Discharge documents. Each submit updates the linked Inpatient Admission to Discharged. Rows that fail validation (nursing checklist, billing, open service requests, etc.) are logged and skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_discharge_submit_migration', 'discharges')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Submit Visits & Mark Completed'), () => {
			frappe.confirm(
				__(
					'Run in background: submit all draft Patient Visits, then set status to Completed. Already-submitted visits that are not Completed will also be marked Completed. Rows that fail validation are logged and skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_patient_visit_migration', 'patient_visits')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Close All Appointments'), () => {
			frappe.confirm(
				__(
					'Run in background: set all Patient Appointments (except Cancelled) to Closed. Continue?'
				),
				() => run_migration_job(frm, 'start_appointment_close_migration', 'appointments')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Complete All Medication Orders'), () => {
			frappe.confirm(
				__(
					'Run in background: submit all draft Patient Medication Orders, then set completed orders to total and mark status Completed. Rows that fail validation are logged and skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_medication_order_complete_migration', 'medication_orders')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Import Patient History from Staging'), () => {
			frappe.call({
				method: 'healthcare.api.patient_history_import.run_patient_history_import_preview',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Run in background: for each admission on Patient History Import, create or update one Patient History (Default History Form) and fill history_detail lines by Attrib Num. Import rows: {0}, admissions: {1}, rows without admission: {2}. Continue?',
							[
								counts.import_rows || 0,
								counts.admissions || 0,
								counts.unresolved_rows || 0,
							]
						),
						() =>
							run_migration_job(
								frm,
								'start_patient_history_import_migration',
								'patient_history_import'
							)
					);
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Backfill Patient History Dates from Import'), () => {
			frappe.call({
				method: 'healthcare.api.patient_history_date_backfill.run_patient_history_date_backfill_preview',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Run in background: for each Patient History linked to an admission with no date, use Patient History Import CR Date when available; otherwise use the linked Inpatient Admission date (Admitted Datetime or Admission Date).\n\nWith admission: {0}\nMissing date: {1}\nSample can update: {2} / {3}\nSample from import CR Date: {4}\nSample from admission date: {5}\nSample with no date source: {6}\n\nContinue?',
							[
								counts.total_with_admission || 0,
								counts.missing_date || 0,
								counts.sample_can_update || 0,
								counts.sample_checked || 0,
								counts.sample_from_import || 0,
								counts.sample_from_admission || 0,
								counts.sample_no_date || 0,
							]
						),
						() =>
							run_migration_job(
								frm,
								'start_patient_history_date_backfill_migration',
								'patient_history_date_backfill'
							)
					);
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Link IP Admission Medicine to PMO'), () => {
			frappe.confirm(
				__(
					'Run in background: group IP Admission Medicine by admission, create/update one Patient Medication Order per admission, and append medication lines with trans_num + legacy medicine fields (old code/name, stopped reason). Existing linked trans_num rows are skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_ip_admission_medicine_link_migration', 'ip_admission_medicine_link')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Map Medicine Given/Missed from Sheet'), () => {
			frappe.confirm(
				__(
					'Run in background: map IP Admission Medicine Sheet rows to Admission Detail child tables (Given Y -> Medicine Given, Given N -> Missed Medicine), linking old medicine fields, IP medicine refs, and patient medication order. Existing mapped sheet rows are skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_ip_admission_medicine_sheet_map_migration', 'ip_admission_medicine_sheet_map')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Map IP Patient Assessment to Patient Assessment'), () => {
			frappe.confirm(
				__(
					'Run in background: create Patient Assessment rows from IP Patient Assessment using template “Default Patient Evaluation”. Parameters are matched by Patient Assessment Parameter.parameter_abbrev against IP fields (e.g. ARRIVAL -> arrival). Value 1/Yes sets child row Yes; *_desc is copied to comments. Existing linked rows are skipped. Continue?'
				),
				() => run_migration_job(frm, 'start_ip_patient_assessment_map_migration', 'ip_patient_assessment_map')
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Import Discharge Checklist from Excel'), () => {
			const uploader = new frappe.ui.FileUploader({
				dialog_title: __('Import Discharge Checklist'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.xlsx', '.xls'],
				},
				on_success(file) {
					frappe.call({
						method: 'healthcare.api.discharge_checklist_import.preview_discharge_checklist_import',
						args: { file_url: file.file_url },
						freeze: true,
						freeze_message: __('Reading Excel…'),
						callback(preview) {
							const counts = preview.message || {};
							frappe.confirm(
								__(
									'Import discharge checklist rows into existing Discharge records?\n\nExcel rows: {0}\nAdmissions in file: {1}\nCan match admission + Discharge: {2}\nRows without admission number: {3}\n\nEach admission gets Default Discharge Template (9 actions) filled from Oracle (SR_NUM, action, department, flags, CR/UP fields). Continue?',
									[
										counts.excel_rows || 0,
										counts.admissions || 0,
										counts.resolvable_admissions || 0,
										counts.unresolved_rows || 0,
									]
								),
								() => {
									frappe.call({
										method:
											'healthcare.api.data_migration_jobs.start_discharge_checklist_import_migration',
										args: { file_url: file.file_url },
										freeze: true,
										freeze_message: __('Starting background job…'),
										callback(r) {
											if (r.message?.ok) {
												frappe.show_alert({
													message: r.message.message || __('Job started'),
													indicator: 'green',
												});
												poll_migration_status('discharge_checklist_import');
											}
										},
									});
								}
							);
						},
					});
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Import Nursing Checklist from Excel'), () => {
			const uploader = new frappe.ui.FileUploader({
				dialog_title: __('Import Nursing Checklist'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.xlsx', '.xls'],
				},
				on_success(file) {
					frappe.call({
						method: 'healthcare.api.nursing_checklist_import.preview_nursing_checklist_import',
						args: { file_url: file.file_url },
						freeze: true,
						freeze_message: __('Reading Excel…'),
						callback(preview) {
							const counts = preview.message || {};
							frappe.confirm(
								__(
									'Import nursing checklist rows into existing Discharge records?\n\nExcel rows: {0}\nAdmissions in file: {1}\nCan match admission + Discharge: {2}\nRows without admission number: {3}\n\nEach admission gets Default Nursing Discharge Checklist tasks, then Oracle values are applied by SR Num / Action Required (action, description, cost center, CR/UP fields). Continue?',
									[
										counts.excel_rows || 0,
										counts.admissions || 0,
										counts.resolvable_admissions || 0,
										counts.unresolved_rows || 0,
									]
								),
								() => {
									frappe.call({
										method:
											'healthcare.api.data_migration_jobs.start_nursing_checklist_import_migration',
										args: { file_url: file.file_url },
										freeze: true,
										freeze_message: __('Starting background job…'),
										callback(r) {
											if (r.message?.ok) {
												frappe.show_alert({
													message: r.message.message || __('Job started'),
													indicator: 'green',
												});
												poll_migration_status('nursing_checklist_import');
											}
										},
									});
								}
							);
						},
					});
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Fix Comma Case No (1,415 → 1415)'), () => {
			frappe.call({
				method: 'healthcare.api.legacy_id_normalize.preview_comma_admission_ids',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Normalize Inpatient Admission Case No values with commas (e.g. 1,415 → 1415)?\n\nRecords to process: {0}\n\nCase No is the canonical ID (document name should match). Duplicate plain Case Nos are removed first, then Case No and linked Discharge rows are fixed. Continue?',
							[counts.count || 0]
						),
						() =>
							run_migration_job(
								frm,
								'start_comma_admission_id_migration',
								'comma_admission_ids'
							)
					);
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Fix Comma Discharge Admission (1,415 → 1415)'), () => {
			frappe.call({
				method: 'healthcare.api.legacy_id_normalize.preview_comma_discharge_ids',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Normalize Discharge Admission links (Inpatient Case No) with commas (e.g. 1,415 → 1415)?\n\nRecords to process: {0}\n\nAdmission is the canonical ID (document name should match). Duplicate plain discharges are removed first (submitted ones cancelled), then Admission and name are aligned to the fixed Inpatient Admission Case No. Run after the Case No admission fix. Continue?',
							[counts.count || 0]
						),
						() =>
							run_migration_job(
								frm,
								'start_comma_discharge_id_migration',
								'comma_discharge_ids'
							)
					);
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Map Clinical Note Types from Diagnosis Flag'), () => {
			frappe.confirm(
				__(
					'Run in background: set Clinical Note Type from diagnosis_flag — 1/DOC → Doctor Progress Note, 2/PSY → Psychologist Note, 3/NUT → Nutritionist Note, 4/OCC → General Note. IP rows with empty flag, inpatient admission, and Nurse medical role → Nursing Note only. Rows already matching are skipped. Continue?'
				),
				() =>
					run_migration_job(
						frm,
						'start_clinical_note_type_from_flag_migration',
						'clinical_note_type_from_flag'
					)
			);
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Backfill Morse Fall Scale Details'), () => {
			frappe.call({
				method: 'healthcare.api.morse_fall_scale_detail_import.preview_morse_fall_scale_detail_import',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Run in background: for each MORSE_FALL_SCALE_01 staging row with a matching patient and admission, replace Morse Fall Scale detail lines (text message + points from TEXT_MESSAGE_1–7 / GET_POINTS_1–7) and update total points. Staging rows: {0}, resolvable: {1}, unresolved: {2} (missing patient/admission: {3}, Morse not found: {4}). Continue?',
							[
								counts.staging_rows || 0,
								counts.resolvable || 0,
								counts.unresolved || 0,
								counts.missing_patient_or_admission || 0,
								counts.morse_not_found || 0,
							]
						),
						() =>
							run_migration_job(
								frm,
								'start_morse_fall_scale_detail_migration',
								'morse_fall_scale_detail'
							)
					);
				},
			});
		}, __('Data Maintenance'));
	},

	onload: function(frm) {
		// Keep Healthcare workspace sidebar visible when viewing Settings (e.g. after refresh)
		if (frappe.boot.workspace_sidebar_item && frappe.boot.workspace_sidebar_item.healthcare) {
			frappe.app.sidebar && frappe.app.sidebar.setup('Healthcare');
		}
	},
	setup: function(frm) {
		frm.set_query('default_google_calendar', function(doc) {
			return {
				filters: {
					'enable': true
				}
			};
		});
		frm.set_query('account', 'receivable_account', function(doc, cdt, cdn) {
			var d  = locals[cdt][cdn];
			return {
				filters: {
					'account_type': 'Receivable',
					'company': d.company,
					'is_group': 0
				}
			};
		});
		frm.set_query('account', 'income_account', function(doc, cdt, cdn) {
			var d  = locals[cdt][cdn];
			return {
				filters: {
					'root_type': 'Income',
					'company': d.company,
					'is_group': 0
				}
			};
		});
		frm.set_query('default_code_system', function(doc) {
			return {
				filters: {
					'is_fhir_defined': false
				}
			};
		});
		frm.set_query('default_priority', function () {
			return {
				filters: {
					code_system: 'Priority'
				}
			};
		});

		frm.set_query('default_intent', function () {
			return {
				filters: {
					code_system: 'Intent'
				}
			};
		});

		set_query_service_item(frm, 'inpatient_visit_charge_item');
		set_query_service_item(frm, 'op_consulting_charge_item');
		set_query_service_item(frm, 'clinical_procedure_consumable_item');
		set_query_service_item(frm, 'registration_item');
	}
});

function run_migration_job(frm, method, jobKey) {
	frappe.call({
		method: `healthcare.api.data_migration_jobs.${method}`,
		freeze: true,
		freeze_message: __('Starting background job…'),
		callback(r) {
			if (r.message?.ok) {
				frappe.show_alert({
					message: r.message.message || __('Job started'),
					indicator: 'green',
				});
				poll_migration_status(jobKey);
			}
		},
	});
}

function poll_migration_status(jobKey) {
	const poll = () => {
		frappe.call({
			method: 'healthcare.api.data_migration_jobs.get_migration_job_status',
			args: { job: jobKey },
			callback(r) {
				const s = r.message || {};
				if (s.running && !s.done) {
					if (s.processed) {
						frappe.show_alert({
							message: __('{0}: {1} records processed so far…', [jobKey, s.processed]),
							indicator: 'blue',
						});
					}
					setTimeout(poll, 15000);
				} else if (s.done && !s.error) {
					frappe.show_alert({
						message: __('{0} finished ({1} records). See Error Log for summary.', [
							jobKey,
							s.processed || 0,
						]),
						indicator: 'green',
					});
				} else if (s.error) {
					frappe.msgprint({
						title: __('Job failed'),
						indicator: 'red',
						message: __('Check Error Log for details.'),
					});
				}
			},
		});
	};
	setTimeout(poll, 5000);
}

var set_query_service_item = function(frm, service_item_field) {
	frm.set_query(service_item_field, function() {
		return {
			filters: {
				'is_sales_item': 1,
				'is_stock_item': 0
			}
		};
	});
};

frappe.tour['Healthcare Settings'] = [
	{
		fieldname: 'link_customer_to_patient',
		title: __('Link Customer to Patient'),
		description: __('If checked, a customer will be created for every Patient. Patient Invoices will be created against this Customer. You can also select existing Customer while creating a Patient. This field is checked by default.')
	},
	{
		fieldname: 'default_code_system',
		title: __('Default Code System'),
		description: __('Will be set as the default Code System selected in the Codification Table')
	},
	{
		fieldname: 'default_google_calendar',
		title: __('Default Google Calendar'),
		description: __('While booking tele-consultation appointments via Google Meet, this Google Calendar will be used. You can also configure separate Google Calender for each Practitioner if required')
	},
	{
		fieldname: 'collect_registration_fee',
		title: __('Collect Registration Fee'),
		description: __('If your Healthcare facility bills registrations of Patients, you can check this and set the Registration Fee in the field below. Checking this will create new Patients with a Disabled status by default and will only be enabled after invoicing the Registration Fee.')
	},
	{
		fieldname: 'show_payment_popup',
		title: __('Show Payment Popup'),
		description: __('Checking this will popup to invoice appointment')
	},
	{
		fieldname: 'validate_nursing_checklists',
		title: __('validate_nursing_checklists'),
		description: __('Validates all mandatory tasks in nursing checklist to be Completed before a Patient transactional event. For example, if any of the tasks as part of the Discharge Checklist is not in status Completed, system will alert the user while trying to Discharge the Patient from inpatient facility')
	},
	{
		fieldname: 'inpatient_visit_charge_item',
		title: __('Healthcare Service Items'),
		description: __('You can create a service item for Inpatient Visit Charge and set it here. Similarly, you can set up other Healthcare Service Items for billing in this section. Click ') + "<a href='https://frappehealth.com/docs/v13/user/manual/en/healthcare/healthcare_settings#2-default-healthcare-service-items' target='_blank'>here</a>" + __(' to know more')
	},
	{
		fieldname: 'income_account',
		title: __('Set up default Accounts for the Healthcare Facility'),
		description: __('If you wish to override default accounts settings and configure the Income and Receivable accounts for Healthcare, you can do so here.')

	},
	{
		fieldname: 'send_registration_msg',
		title: __('Out Patient SMS alerts'),
		description: __('If you want to send SMS alert on Patient Registration, you can enable this option. Similary, you can set up Out Patient SMS alerts for other functionalities in this section. Click ') + "<a href='https://frappehealth.com/docs/v13/user/manual/en/healthcare/healthcare_settings#4-out-patient-sms-alerts' target='_blank'>here</a>" + __(' to know more')
	}
];
