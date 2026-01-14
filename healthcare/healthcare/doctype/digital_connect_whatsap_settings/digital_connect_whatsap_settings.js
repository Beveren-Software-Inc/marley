// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Digital Connect Whatsap Settings', {
	refresh: function(frm) {
		// Only show button if document is saved and integration is enabled
		if (!frm.doc.__islocal && frm.doc.enable) {
			frm.add_custom_button(__('Send Test WhatsApp'), function() {
				show_test_message_dialog(frm);
			});

			frm.add_custom_button(__('Fetch Templates from Digital Connect'), function() {
				show_fetch_templates_dialog_from_settings();
			}, __('Templates'));
		}
	},
});

function show_test_message_dialog(frm) {
	frappe.prompt([
		{
			fieldname: 'phone_number',
			label: __('Phone Number'),
			fieldtype: 'Data',
			reqd: 1,
			description: __('Enter phone number in international format (e.g., 254740743521)')
		},
		{
			fieldname: 'body',
			label: __('Message Body'),
			fieldtype: 'Small Text',
			reqd: 1,
			default: 'Please visit https://just-visit',
		},
		{
			fieldname: 'preview_url',
			label: __('Enable URL Preview'),
			fieldtype: 'Check',
			default: 1,
		},
	], function(values) {
		send_test_whatsapp_message(frm, values);
	}, __('Send Test WhatsApp'), __('Send'));
}

function send_test_whatsapp_message(frm, values) {
	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings.send_test_message',
		args: {
			phone_number: values.phone_number,
			body: values.body,
			preview_url: values.preview_url ? 1 : 0,
		},
		freeze: true,
		freeze_message: __('Sending test message...'),
		callback: function(r) {
			if (r.exc) {
				frappe.msgprint({
					title: __('Error'),
					message: r.exc,
					indicator: 'red',
				});
			} else if (r.message) {
				frappe.msgprint({
					title: __('Digital Connect Response'),
					message: '<div style="max-height: 400px; overflow-y: auto;"><pre style="white-space: pre-wrap; word-break: break-word; font-size: 12px;">' +
						frappe.utils.escape_html(JSON.stringify(r.message, null, 2)) +
					'</pre></div>',
					indicator: 'green',
				});
				
				// Show success alert
				frappe.show_alert({
					message: __('Test message sent successfully!'),
					indicator: 'green',
				}, 3);
			}
		},
	});
}

function show_fetch_templates_dialog_from_settings() {
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
			fetch_templates_from_api_from_settings(values, dialog);
		}
	});

	dialog.show();
}

function fetch_templates_from_api_from_settings(filters, dialog) {
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
				// Refresh template list view if open
				if (cur_list && cur_list.doctype === 'Digital Whatsapp Template') {
					cur_list.refresh();
				}
			}
		}
	});
}
