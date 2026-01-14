// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Digital Whatsapp Template', {
	refresh: function(frm) {
		// Show fetch templates button
		if (!frm.doc.__islocal) {
			frm.add_custom_button(__('Fetch Templates from Digital Connect'), function() {
				show_fetch_templates_dialog(frm);
			}, __('Actions'));

			// Show sync button if template has ID
			if (frm.doc.template_id) {
				frm.add_custom_button(__('Sync from Digital Connect'), function() {
					sync_template_from_api(frm);
				}, __('Actions'));
			}

			// Show template insights button if template has ID
			if (frm.doc.template_id) {
				frm.add_custom_button(__('View Template Insights'), function() {
					show_template_insights_dialog(frm);
				}, __('Analytics'));
			}
		}

		// Add indicator for status
		if (frm.doc.status) {
			let indicator = 'orange';
			if (frm.doc.status === 'APPROVED') {
				indicator = 'green';
			} else if (frm.doc.status === 'REJECTED') {
				indicator = 'red';
			} else if (frm.doc.status === 'PAUSED') {
				indicator = 'gray';
			}
			frm.dashboard.add_indicator(__('Status: {0}', [frm.doc.status]), indicator);
		}

		// Show character count for body text
		if (frm.doc.body_text) {
			const charCount = frm.doc.body_text.length;
			const maxChars = 1024;
			if (charCount > maxChars) {
				frm.dashboard.add_indicator(
					__('Body text exceeds {0} characters (current: {1})', [maxChars, charCount]),
					'red'
				);
			} else {
				frm.dashboard.add_indicator(
					__('Body text: {0}/{1} characters', [charCount, maxChars]),
					'blue'
				);
			}
		}
	},

	language: function(frm) {
		// Auto-set language code when language changes
		if (frm.doc.language) {
			frappe.db.get_value('Language', frm.doc.language, 'language_code', (r) => {
				if (r && r.language_code) {
					let lang_code = r.language_code;
					if (lang_code.includes('-')) {
						lang_code = lang_code.replace('-', '_');
					} else if (!lang_code.includes('_')) {
						lang_code = lang_code + '_US';
					}
					frm.set_value('language_code', lang_code);
				}
			});
		}
	},

	template_name: function(frm) {
		// Auto-generate actual_name from template_name
		if (frm.doc.template_name && !frm.doc.actual_name) {
			let actual_name = frm.doc.template_name.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/-/g, '_');
			frm.set_value('actual_name', actual_name);
		}
	},

	body_text: function(frm) {
		// Validate body text length
		if (frm.doc.body_text && frm.doc.body_text.length > 1024) {
			frappe.msgprint({
				title: __('Validation Error'),
				message: __('Body text cannot exceed 1024 characters. Current length: {0}', [frm.doc.body_text.length]),
				indicator: 'red'
			});
		}
	}
});

function show_fetch_templates_dialog(frm) {
	let dialog = new frappe.ui.Dialog({
		title: __('Fetch Templates from Digital Connect'),
		fields: [
			{
				fieldname: 'category',
				label: __('Category'),
				fieldtype: 'Select',
				options: '\nAUTHENTICATION\nMARKETING\nUTILITY',
			},
			{
				fieldname: 'status',
				label: __('Status'),
				fieldtype: 'Select',
				options: '\nPENDING\nAPPROVED\nREJECTED\nPAUSED',
			},
			{
				fieldname: 'language',
				label: __('Language Code'),
				fieldtype: 'Data',
				description: __('e.g., en_US, es_ES')
			},
			{
				fieldname: 'name',
				label: __('Template Name or Content'),
				fieldtype: 'Data',
				description: __('Search by template name or content')
			}
		],
		primary_action_label: __('Fetch'),
		primary_action(values) {
			fetch_templates_from_api(values, dialog);
		}
	});

	dialog.show();
}

function fetch_templates_from_api(filters, dialog) {
	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_whatsapp_template.digital_whatsapp_template.fetch_templates',
		args: {
			category: filters.category || null,
			status: filters.status || null,
			language: filters.language || null,
			name: filters.name || null
		},
		freeze: true,
		freeze_message: __('Fetching templates from Digital Connect...'),
		callback: function(r) {
			dialog.hide();
			if (r.exc) {
				frappe.msgprint({
					title: __('Error'),
					message: r.exc,
					indicator: 'red'
				});
			} else if (r.message) {
				frappe.msgprint({
					title: __('Success'),
					message: __('Successfully fetched and synced {0} template(s).', [r.message.synced_count || 0]),
					indicator: 'green'
				});
				// Refresh list view
				if (cur_list) {
					cur_list.refresh();
				}
			}
		}
	});
}

function sync_template_from_api(frm) {
	if (!frm.doc.actual_name) {
		frappe.msgprint({
			title: __('Error'),
			message: __('Template name is required to sync.'),
			indicator: 'red'
		});
		return;
	}

	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_whatsapp_template.digital_whatsapp_template.fetch_templates',
		args: {
			name: frm.doc.actual_name
		},
		freeze: true,
		freeze_message: __('Syncing template from Digital Connect...'),
		callback: function(r) {
			if (r.exc) {
				frappe.msgprint({
					title: __('Error'),
					message: r.exc,
					indicator: 'red'
				});
			} else {
				frappe.msgprint({
					title: __('Success'),
					message: __('Template synced successfully.'),
					indicator: 'green'
				});
				frm.reload_doc();
			}
		}
	});
}

function show_template_insights_dialog(frm) {
	if (!frm.doc.template_id) {
		frappe.msgprint({
			title: __('Error'),
			message: __('Template ID is required to view insights.'),
			indicator: 'red'
		});
		return;
	}

	// Get date range (default to last 30 days)
	let end_date = new Date();
	let start_date = new Date();
	start_date.setDate(start_date.getDate() - 30);

	let dialog = new frappe.ui.Dialog({
		title: __('Template Insights'),
		fields: [
			{
				fieldname: 'start_date',
				label: __('Start Date'),
				fieldtype: 'Date',
				default: frappe.datetime.str_to_obj(frappe.datetime.obj_to_str(start_date))
			},
			{
				fieldname: 'end_date',
				label: __('End Date'),
				fieldtype: 'Date',
				default: frappe.datetime.str_to_obj(frappe.datetime.obj_to_str(end_date))
			},
			{
				fieldname: 'granularity',
				label: __('Granularity'),
				fieldtype: 'Select',
				options: '\nDAILY',
				default: 'DAILY'
			}
		],
		primary_action_label: __('Get Insights'),
		primary_action(values) {
			get_template_insights(frm, values, dialog);
		}
	});

	dialog.show();
}

function get_template_insights(frm, values, dialog) {
	// Format dates as DD-MM-YYYY
	let start_date_str = frappe.datetime.str_to_user(values.start_date);
	let end_date_str = frappe.datetime.str_to_user(values.end_date);
	
	// Convert to DD-MM-YYYY format
	let start_parts = start_date_str.split('-');
	let end_parts = end_date_str.split('-');
	
	let start_formatted = `${start_parts[2]}-${start_parts[1]}-${start_parts[0]}`;
	let end_formatted = `${end_parts[2]}-${end_parts[1]}-${end_parts[0]}`;

	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_whatsapp_template.digital_whatsapp_template.get_template_insights',
		args: {
			template_id: frm.doc.template_id,
			start_date: start_formatted,
			end_date: end_formatted,
			granularity: values.granularity || 'DAILY'
		},
		freeze: true,
		freeze_message: __('Fetching template insights...'),
		callback: function(r) {
			dialog.hide();
			if (r.exc) {
				frappe.msgprint({
					title: __('Error'),
					message: r.exc,
					indicator: 'red'
				});
			} else if (r.message && r.message.data) {
				// Display insights in a formatted way
				let insights_html = '<div style="max-height: 400px; overflow-y: auto;"><pre style="white-space: pre-wrap; word-break: break-word; font-size: 12px;">' +
					frappe.utils.escape_html(JSON.stringify(r.message.data, null, 2)) +
					'</pre></div>';

				frappe.msgprint({
					title: __('Template Insights'),
					message: insights_html,
					indicator: 'blue'
				});
			}
		}
	});
}
