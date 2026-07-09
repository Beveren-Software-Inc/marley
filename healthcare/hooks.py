from . import __version__ as app_version  # noqa

app_name = "healthcare"
app_title = "Healthcare"
app_publisher = "earthians Health Informatics Pvt. Ltd."
app_description = "Modern, Open Source HIS built on Frappe and ERPNext"
app_icon = "octicon octicon-file-directory"
app_icon_url = "/assets/healthcare/images/healthcare.svg"
app_color = "grey"
app_email = "info@earthianslive.com"
app_license = "GNU GPL V3"
required_apps = ["frappe/erpnext"]

# Apps
# ------------------

add_to_apps_screen = [
	{
		"name": "healthcare",
		"logo": "/assets/healthcare/images/healthcare.svg",
		"title": "Healthcare",
		"route": "/health",
	}
]

# Includes in <head>
# ------------------


fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                (
                    "Contact-custom_mobile_owner",
                    "Contact-custom_whatsapp",
                    
                    #Sales invoice
                    "Sales Invoice-custom_base_reference_name",
                    "Sales Invoice-custom_column_break_oy8ws",
                    "Sales Invoice-custom_reference_name",
                    "Sales Invoice-custom_reference_name",
                    "Sales Invoice-custom_base_reference",
                    "Sales Invoice-custom_reference_type",
                    "Sales Invoice-custom_health_reference",
                    "Sales Invoice-custom_amount_to_be_covered",
                    "Sales Invoice-custom_column_break_tbrxu",
                    "Sales Invoice-custom_health_insurance",
                    "Sales Invoice-custom_insurance",
                    
                    "Sales Invoice Item-custom_prescription",
                    "Sales Invoice Item-custom_dosage",
                    "Sales Invoice Item-custom_column_break_wqds5",
                    "Sales Invoice Item-custom_prescription_dosage",
                    
                    #Order
                    "Sales Order Item-custom_prescription",
                    "Sales Order Item-custom_dosage",
                    "Sales Order Item-custom_column_break_3vdka",
                    "Sales Order Item-custom_prescription_frequency",
                    "Quotation-custom_inpatient_admission",
                    "Quotation-custom_package",
                    "Sales Order-custom_healthcare_reference",
                    "Sales Order-custom_reference_type",
                    "Sales Order-custom_column_break_rq7zb",
                    "Sales Order-custom_reference_name",
                    "Sales Order-custom_amount_to_be_covered",
                    "Sales Order-custom_column_break_aiazv",
                    "Sales Order-custom_health_insurance",
                    "Sales Order-custom_insurance",
                  
                    "Quotation-custom_paient_name",
                    "Quotation-custom_patient",
                    "Sales Order-custom_patient_name",
                    "Sales Order-custom_patient",
                    "Payment Entry-custom_insurance_company",
                    "Payment Entry-custom_column_break_efj7r",
                    "Payment Entry-custom_insurance_claim",
                    "Payment Entry-custom_insurance_reference",
                    "Quotation-custom_reference_name",
                    "Quotation-custom_reference_type",
                    "Quotation-custom_column_break_uzvkh",
                    "Quotation-custom_healthcare_reference",
                    
                    #sales
                    "Sales Order-custom_base_reference",
                    "Sales Order-custom_base_reference_name",
                    "Sales Invoice-custom_internal_employee",
                    "Sales Invoice-custom_created_at",
                    "Cost Center-custom_patient_care_type",
                    
                    "Delivery Note-custom_patient",
                   
                   #stock
                   "Stock Entry-custom_nurse_inventory",
                   "Stock Entry-custom_lab_inventory",
                   "Stock Entry-custom_notes",
                   "Stock Entry-custom_section_break_prxhx",
                   "Stock Reconciliation-custom_nurse_inventory",
                   "Stock Reconciliation-custom_lab_inventory",
                   "Stock Reconciliation-custom_notes",
                   "Stock Reconciliation-custom_section_break_xaoh0",
                   "Material Request-custom_notes",
                   "Material Request-custom_section_break_gmmp2",
                   "Material Request-custom_nurse_inventory",
                   "Material Request-custom_lab_inventory",
                   
                   "Item-custom_maximum_dose_limit",
                   "Item-custom_scientific_name",
                   "Item Group-custom_is_pink",
                   "Item-custom_max_dose_per_day",
                   "Item-custom_max_dose_per_single_dose",
                   "Item-custom_high_alert",
                   "Item-custom_drug_category",

                ),
            ]
        ],
    },
    {
        "doctype": "Discharge Template"
    },
    {
		"doctype": "Medical Role"
	},
    {
		"doctype": "Prescription Frequency"
	},
    {
		"doctype": "Patient Assessment Parameter"
	},
    {
		"doctype": "Environmental Checklist Template"
	},
    {
		"doctype": "History Form Details Template"
	},
    {
		"doctype": "Room Category"
	},
    {
		"doctype":"Package Duration Class"
	},
    {
		"doctype":"Patient Source"
	},
    {
		"doctype":"Patient Visit Type"
	},
    {
		"doctype":"Time Out Procedure Template"
	},
    {
	"doctype":"Anesthesia Terms"	
	},
    {
	"doctype":"Patient History Template"	
	},
    {
	"doctype":"Patient Assessment Template"	
	},
    {
	"doctype":"Homicide Reason for Assessment"	
	},
    {
		"doctype":"Depression Assessment Template"
	},
    {
		"doctype":"GAD7 Template"
	},
    {
		"doctype":"Mood Disorder Template"
	},
    {
		"doctype":"ADHD Assessment Template"
	},
    {
		"doctype":"PHQ9 Template"
	},
    {
		"doctype":"Modified Alderete Score Template"
	},
    {
		"doctype":"Healthcare Activity"
	},
    {
		"doctype":"Nursing Checklist Template"
	},
    {
		"doctype":"Observation Level"
	},
    {
		"doctype":"Patient Relative Relationship"
	},
    {
		"doctype":"DAMA Type"
	},
    {
		"doctype":"Patient Category"
	},
    {
		"doctype":"Service Template Group"
	},
    {
		"doctype": "Lab Test Result Rule"
	},
    {
		"doctype":"Practitioner Schedule"
	},
    {
		"doctype":"YBOCS Template"
	},
    {
		"doctype":"YMRS Template"
	}
]

# include js, css files in header of desk.html
# app_include_css = "/assets/healthcare/css/healthcare.css"
app_include_js = "healthcare.bundle.js"

# include js, css files in header of web template
# web_include_css = "/assets/healthcare/css/healthcare.css"
# web_include_js = "/assets/healthcare/js/healthcare.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "healthcare/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {"Sales Invoice": "public/js/sales_invoice.js",
              
              "Sales Order": "public/js/sales_order.js",
              "Quotation": "public/js/quotation.js",}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
jinja = {
	"methods": [
		"healthcare.healthcare.doctype.diagnostic_report.diagnostic_report.diagnostic_report_print",
		"healthcare.healthcare.utils.generate_barcodes",
		"healthcare.healthcare.doctype.observation.observation.get_observations_for_medical_record",
	]
}

# Installation
# ------------

# before_install = "healthcare.install.before_install"
after_install = "healthcare.setup.setup_healthcare"

# Uninstallation
# ------------

before_uninstall = "healthcare.uninstall.before_uninstall"
after_uninstall = "healthcare.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "healthcare.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
	"Sales Invoice": "healthcare.healthcare.custom_doctype.sales_invoice.HealthcareSalesInvoice",
}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"*": {
		"after_insert": "healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.handle_after_insert",
		"on_update": "healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.handle_on_update",
		"on_submit": [
			"healthcare.healthcare.doctype.patient_history_settings.patient_history_settings.create_medical_record",
			"healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.handle_on_submit",
		],
		"on_cancel": [
			"healthcare.healthcare.doctype.patient_history_settings.patient_history_settings.delete_medical_record",
			"healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.handle_on_cancel",
		],
		"on_update_after_submit": [
			"healthcare.healthcare.doctype.patient_history_settings.patient_history_settings.update_medical_record",
			"healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.handle_on_update_after_submit",
		],
		"validate": [
			"healthcare.healthcare.custom_doctype.sales_invoice.validate",
			"healthcare.healthcare.editing_lock.validate_editing_not_locked",
		]
	},
	"Sales Invoice": {
		"on_submit": "healthcare.healthcare.utils.manage_invoice_submit_cancel",
		"on_cancel": "healthcare.healthcare.utils.manage_invoice_submit_cancel",
		"validate": ["healthcare.healthcare.utils.manage_invoice_validate",
               		"healthcare.controllers.discount_validation.validate_discount"],
	},
	"Sales Order": {
		"validate": "healthcare.controllers.discount_validation.validate_discount",	
	},
	"Quotation": {
		"before_save": "healthcare.controllers.discount_validation.validate_discount",
		"on_submit": "healthcare.controllers.quotation.create_sales_order_from_package_quotation",
	},
	"Company": {
		"after_insert": "healthcare.healthcare.utils.create_healthcare_service_unit_tree_root",
		"on_trash": "healthcare.healthcare.utils.company_on_trash",
	},
	"Patient": {
		"after_insert": "healthcare.regional.india.abdm.utils.set_consent_attachment_details"
	},
	"Lab Test": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Service Request": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Stock Entry": {
		"before_insert": "healthcare.api.nursing_inventory.inherit_mini_warehouse_flags_on_stock_entry",
	},
	"Patient Medication Order": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Physical Examination": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Patient Medical History": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Clinical Suicide Risk Assessment": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Patient History": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Vital Signs": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Observation": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Sleeping Pattern": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"IP Service": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Pre ECT Checklist": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"ECT Anesthesia Consent": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
	"Pre Anesthesia Assessment": {
		"validate": "healthcare.healthcare.care_episode_guard.validate_care_episode_open",
	},
}

scheduler_events = {
	"all": [
		"healthcare.healthcare.doctype.patient_appointment.patient_appointment.send_appointment_reminder",
	],
	"cron": {
		"0 */2 * * *": [
			"healthcare.api.medicine_given.create_missed_medicine_for_active_admissions",
		],
		"59 23 * * *": [
			"healthcare.api.observation.create_daily_observation_sales_orders",
		],
	},
	"daily": [
		"healthcare.healthcare.doctype.patient_appointment.patient_appointment.update_appointment_status",
		"healthcare.healthcare.doctype.fee_validity.fee_validity.update_validity_status",
		"healthcare.healthcare.doctype.insurance_patient_register.insurance_patient_register.expire_unused_registers",
		"healthcare.api.nursing_inventory.create_daily_medicine_sales_orders",
		"healthcare.api.daily_patient_visit.process_daily_patient_visits",
		"healthcare.api.whatsapp_reminders.send_daily_whatsapp_reminders",
		"healthcare.api.lab_test.create_daily_repeat_lab_tests",
	],
	"monthly": [
		"healthcare.healthcare.doctype.patient_follow_up.follow_up_crm_messages.send_follow_up_mid_end_year_messages",
	],
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"healthcare.tasks.all"
# 	],
# 	"daily": [
# 		"healthcare.tasks.daily"
# 	],
# 	"hourly": [
# 		"healthcare.tasks.hourly"
# 	],
# 	"weekly": [
# 		"healthcare.tasks.weekly"
# 	],
# 	"monthly": [
# 		"healthcare.tasks.monthly"
# 	],
# }

# Testing
# -------

before_tests = "healthcare.healthcare.utils.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "healthcare.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "healthcare.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
auto_cancel_exempted_doctypes = [
	"Inpatient Medication Entry",
]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"healthcare.auth.validate"
# ]

global_search_doctypes = {
	"Healthcare": [
		{"doctype": "Patient", "index": 1},
		{"doctype": "Medical Department", "index": 2},
		{"doctype": "Vital Signs", "index": 3},
		{"doctype": "Healthcare Practitioner", "index": 4},
		{"doctype": "Patient Appointment", "index": 5},
		{"doctype": "Healthcare Service Unit", "index": 6},
		{"doctype": "Patient Visit", "index": 7},
		{"doctype": "Antibiotic", "index": 8},
		{"doctype": "Diagnosis", "index": 9},
		{"doctype": "Lab Test", "index": 10},
		{"doctype": "Clinical Procedure", "index": 11},
		{"doctype": "Inpatient Admission", "index": 12},
		{"doctype": "Sample Collection", "index": 13},
		{"doctype": "Patient Medical Record", "index": 14},
		{"doctype": "Appointment Type", "index": 15},
		{"doctype": "Fee Validity", "index": 16},
		{"doctype": "Practitioner Schedule", "index": 17},
		{"doctype": "Dosage Form", "index": 18},
		{"doctype": "Lab Test Sample", "index": 19},
		{"doctype": "Prescription Duration", "index": 20},
		{"doctype": "Prescription Frequency", "index": 21},
		{"doctype": "Sensitivity", "index": 22},
		{"doctype": "Complaint", "index": 23},
		{"doctype": "Medical Code", "index": 24},
	]
}

website_route_rules = [
	{"from_route": "/health", "to_route": "health_frontend"},
	{"from_route": "/health/<path:app_path>", "to_route": "health_frontend"},
]

domains = {
	"Healthcare": "healthcare.setup",
}

# nosemgrep
standard_portal_menu_items = [
	{
		"title": "Personal Details",
		"route": "/personal-details",
		"reference_doctype": "Patient",
		"role": "Patient",
	},
	{
		"title": "Lab Test",
		"route": "/lab-test",
		"reference_doctype": "Lab Test",
		"role": "Patient",
	},
	{
		"title": "Prescription",
		"route": "/prescription",
		"reference_doctype": "Patient Visit",
		"role": "Patient",
	},
	{
		"title": "Patient Appointment",
		"route": "/patient-appointments",
		"reference_doctype": "Patient Appointment",
		"role": "Patient",
	},
]

has_website_permission = {
	"Lab Test": "healthcare.healthcare.web_form.lab_test.lab_test.has_website_permission",
	"Patient Visit": "healthcare.healthcare.web_form.prescription.prescription.has_website_permission",
	"Patient Appointment": "healthcare.healthcare.web_form.patient_appointments.patient_appointments.has_website_permission",
	"Patient": "healthcare.healthcare.web_form.personal_details.personal_details.has_website_permission",
}

standard_queries = {
	"Healthcare Practitioner": "healthcare.healthcare.doctype.healthcare_practitioner.healthcare_practitioner.get_practitioner_list",
	"Prescription Frequency": "healthcare.healthcare.doctype.prescription_frequency.prescription_frequency.get_prescription_frequency_list",
}

treeviews = [
	"Healthcare Service Unit",
]

company_data_to_be_ignored = [
	"Healthcare Service Unit",
]
