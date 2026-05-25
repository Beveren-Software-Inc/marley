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
