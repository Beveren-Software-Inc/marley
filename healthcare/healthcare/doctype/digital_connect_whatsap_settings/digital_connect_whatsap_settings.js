// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Digital Connect Whatsap Settings', {
	refresh: function(frm) {
		// Only show button if document is saved and integration is enabled
		if (!frm.doc.__islocal && frm.doc.enable) {
			frm.add_custom_button(__('Send Test WhatsApp'), function() {
				show_test_message_dialog(frm);
			});
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
