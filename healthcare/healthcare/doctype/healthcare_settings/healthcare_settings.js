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

		frm.add_custom_button(__('Update Appointments from Oracle Excel'), () => {
			const uploader = new frappe.ui.FileUploader({
				dialog_title: __('Oracle Appointments Excel'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.xlsx', '.xls'],
				},
				on_success(file) {
					frappe.call({
						method:
							'healthcare.api.patient_appointment_old_status_backfill.run_patient_appointment_old_status_backfill_preview',
						args: { file_url: file.file_url },
						freeze: true,
						freeze_message: __('Reading Excel (all sheets)…'),
						callback(preview) {
							const counts = preview.message || {};
							const docSample = (counts.sample_doc_code || [])
								.map(
									(row) =>
										`${row.app_num}: doc_code ${row.current_doc_code || '(empty)'} → ${row.target_doc_code}`
										+ (row.will_set_practitioner
											? `, practitioner → ${row.target_doc_code}`
											: '')
								)
								.join('\n');
							const statusSample = (counts.sample || [])
								.map(
									(row) =>
										`${row.name}: ${row.old_status} → ${row.target_status} (was ${row.current_status})`
								)
								.join('\n');
							frappe.confirm(
								__(
									'Run in background from Oracle appointments Excel (all sheets).\n\n'
									+ '1) Match APP_NUM to Patient Appointment trans_no\n'
									+ '2) Set doc_code from DOC_CODE\n'
									+ '3) Set practitioner only when empty (create Healthcare Practitioner with doctors_id = doc_code if missing)\n'
									+ '4) Set status from old_status / APP_STATUS:\n'
									+ '   V → Closed, S → Scheduled or No Show by date\n\n'
									+ 'Excel rows: {0}\n'
									+ 'Matched appointments: {1}\n'
									+ 'Doc code / practitioner to update: {2} ({3} doc_code, {4} practitioner)\n'
									+ 'Status to update: {5} ({6} Closed, {7} No Show, {8} Scheduled)\n\n'
									+ 'Doc code sample:\n{9}\n\n'
									+ 'Status sample:\n{10}\n\nContinue?',
									[
										counts.excel_rows || 0,
										counts.matched_appointments || 0,
										counts.pending_doc_code_updates || 0,
										counts.doc_code_to_set || 0,
										counts.practitioner_to_set || 0,
										counts.total_needing_update || 0,
										counts.to_closed || 0,
										counts.to_no_show || 0,
										counts.to_scheduled || 0,
										docSample || __('(none)'),
										statusSample || __('(none)'),
									]
								),
								() => {
									frappe.call({
										method:
											'healthcare.api.data_migration_jobs.start_appointment_old_status_migration',
										args: { file_url: file.file_url },
										freeze: true,
										freeze_message: __('Starting background job…'),
										callback(r) {
											if (r.message?.ok) {
												frappe.show_alert({
													message: r.message.message || __('Job started'),
													indicator: 'green',
												});
												poll_migration_status('appointment_old_status');
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

		frm.add_custom_button(__('Delete Orphaned Patient History'), () => {
			frappe.call({
				method: 'healthcare.api.patient_history_orphan_cleanup.run_patient_history_orphan_cleanup_preview',
				callback(preview) {
					const counts = preview.message || {};
					const sample = (counts.sample || []).join(', ');
					const dupPhSample = (counts.sample_duplicate_patient_history || []).join(', ');
					const dupAdmSample = (counts.sample_duplicate_admission_case_nos || []).join(', ');
					frappe.confirm(
						__(
							'Run in background: clean Patient History and duplicate Inpatient Admissions.\n\n'
							+ '1) Orphan Patient History (no linked admission): {0}\n'
							+ '   Sample: {1}\n'
							+ '2) Duplicate Patient History (extra per admission): {2}\n'
							+ '   Sample: {3}\n'
							+ '3) Duplicate Inpatient Admissions ({4} group(s), {5} record(s) to remove)\n'
							+ '   Sample case nos: {6}\n\n'
							+ 'Keeps the best admission per duplicate group (prefers Admitted, linked history). '
							+ 'This cannot be undone. Continue?',
							[
								counts.orphaned_count || 0,
								sample || __('(none)'),
								counts.duplicate_patient_history_count || 0,
								dupPhSample || __('(none)'),
								counts.duplicate_admission_groups || 0,
								counts.duplicate_admissions_to_remove || 0,
								dupAdmSample || __('(none)'),
							]
						),
						() =>
							run_migration_job(
								frm,
								'start_patient_history_orphan_cleanup_migration',
								'patient_history_orphan_cleanup'
							)
					);
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Backfill PMO Inpatient Admission from Written'), () => {
			frappe.call({
				method:
					'healthcare.api.patient_medication_order_admission_backfill.preview_pmo_written_admission_backfill',
				callback(preview) {
					const counts = preview.message || {};
					frappe.confirm(
						__(
							'Backfill Patient Medication Orders that have Written Inpatient Admission?\n\nOrders with written admission: {0}\nNeed update (sampled): {1}\nUnresolved admission (sampled): {2}\n\nSets Inpatient Admission (inpatient_record), patient, patient name/age/nationality, company, and practitioner from the linked admission. Submitted orders are updated via db_set. Continue?',
							[
								counts.candidates || 0,
								counts.needs_update_sampled || 0,
								counts.unresolved_sampled || 0,
							]
						),
						() =>
							run_migration_job(
								frm,
								'start_pmo_written_admission_backfill_migration',
								'pmo_admission_backfill'
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

		frm.add_custom_button(__('Import Patient Medication Orders from CSV/Excel'), () => {
			const uploader = new frappe.ui.FileUploader({
				dialog_title: __('Import Patient Medication Orders'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.csv', '.xlsx', '.xls'],
				},
				on_success(file) {
					frappe.call({
						method: 'healthcare.api.patient_medication_order_import.preview_patient_medication_order_import',
						args: { file_url: file.file_url },
						freeze: true,
						freeze_message: __('Reading file…'),
						callback(preview) {
							const counts = preview.message || {};
							frappe.confirm(
								__(
									'Import legacy Patient Medication Orders?\n\nFile rows: {0}\nDistinct admissions: {1}\nMedicine lines to import: {2}\nAdmissions matched in system: {3}\nRows with blank admission number: {4}\n\nRows with the same admission number are grouped into one Patient Medication Order (multiple child lines). Each order is submitted and marked Completed. Continue?',
									[
										counts.file_rows || 0,
										counts.admissions || 0,
										counts.medicine_lines || 0,
										counts.resolvable_admissions || 0,
										counts.unresolved_rows || 0,
									]
								),
								() => {
									frappe.call({
										method:
											'healthcare.api.data_migration_jobs.start_patient_medication_order_import_migration',
										args: { file_url: file.file_url },
										freeze: true,
										freeze_message: __('Starting background job…'),
										callback(r) {
											if (r.message?.ok) {
												frappe.show_alert({
													message: r.message.message || __('Job started'),
													indicator: 'green',
												});
												poll_migration_status('patient_medication_order_import');
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

		frm.add_custom_button(__('Upload Legacy Lab Header Excel'), () => {
			new frappe.ui.FileUploader({
				dialog_title: __('Select Lab Header Excel (C LAB_00_03)'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.xlsx', '.xls'],
				},
				on_success(file) {
					frm._legacy_lab_header_file_url = file.file_url;
					frappe.show_alert({
						message: __('Lab header file uploaded. Now upload the detail Excel.'),
						indicator: 'green',
					});
				},
			});
		}, __('Data Maintenance'));

		frm.add_custom_button(__('Import Legacy Lab Detail Excel'), () => {
			if (!frm._legacy_lab_header_file_url) {
				frappe.msgprint({
					title: __('Header file required'),
					message: __(
						'Upload the lab header Excel first using “Upload Legacy Lab Header Excel” (C LAB_00_03), then upload the detail file here (C-I LAB_00_04).'
					),
					indicator: 'orange',
				});
				return;
			}

			new frappe.ui.FileUploader({
				dialog_title: __('Select Lab Detail Excel (C-I LAB_00_04)'),
				allow_multiple: false,
				restrictions: {
					allowed_file_types: ['.xlsx', '.xls'],
				},
				on_success(detailFile) {
					const headerFileUrl = frm._legacy_lab_header_file_url;
					frappe.call({
						method: 'healthcare.api.lab_test_legacy_import.preview_legacy_lab_import',
						args: {
							header_file_url: headerFileUrl,
							detail_file_url: detailFile.file_url,
						},
						freeze: true,
						freeze_message: __('Reading Excel files…'),
						callback(preview) {
							const counts = preview.message || {};
							frappe.confirm(
								__(
									'Import legacy lab tests into Lab Test records?\n\nHeader rows: {0}\nDetail rows: {1}\nTransactions: {2}\nWith header (003): {3}\nWith result lines: {4}\nResolvable patient (header rows): {5}\nMatching lab template: {6}\nStandalone (detail only, no 003 header): {7}\n\nHeader rows link patient via Patient Visit / Inpatient Admission (or file number). Standalone rows are created from LAB 00-04 using TRANS_NUM only (no patient on header). No billing is created. Continue?',
									[
										counts.header_rows || 0,
										counts.detail_rows || 0,
										counts.transactions || 0,
										counts.transactions_with_header || counts.header_rows || 0,
										counts.transactions_with_results || 0,
										counts.resolvable_patient || 0,
										counts.resolvable_template || 0,
										counts.standalone_transactions || counts.detail_without_header || 0,
									]
								),
								() => {
									frappe.call({
										method:
											'healthcare.api.data_migration_jobs.start_legacy_lab_import_migration',
										args: {
											header_file_url: headerFileUrl,
											detail_file_url: detailFile.file_url,
										},
										freeze: true,
										freeze_message: __('Starting background job…'),
										callback(r) {
											if (r.message?.ok) {
												frappe.show_alert({
													message: r.message.message || __('Job started'),
													indicator: 'green',
												});
												poll_migration_status('legacy_lab_import');
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
					const missing = s.missing_from_database || 0;
					const ok = s.ok != null ? s.ok : s.processed;
					const errN = s.errors || 0;
					const skipped =
						(s.skip_no_patient || 0) +
						(s.skip_no_header || 0) +
						(s.skip_existing_non_legacy || 0);
					let msg = __('{0} finished: {1} OK, {2} skipped, {3} errors', [
						jobKey,
						ok,
						skipped,
						errN,
					]);
					if (s.in_database != null) {
						msg += __('. {0} legacy Lab Tests in database.', [s.in_database]);
					}
					if (missing > 0) {
						msg += __(
							' {0} Excel TRANS_NUM still missing — search Error Log for "Legacy lab import".',
							[missing]
						);
					} else {
						msg += __(' See Error Log for the full summary.');
					}
					frappe.show_alert({
						message: msg,
						indicator: missing > 0 ? 'orange' : 'green',
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
