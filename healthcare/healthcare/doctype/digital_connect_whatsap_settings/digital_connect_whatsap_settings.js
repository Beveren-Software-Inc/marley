// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Digital Connect Whatsap Settings', {
	refresh: function(frm) {
		// Only show button if document is saved and integration is enabled
		if (!frm.doc.__islocal && frm.doc.enable) {
			frm.add_custom_button(__('Send Test WhatsApp'), function() {
				show_test_message_dialog(frm);
			}, __('Actions'));
		frm.add_custom_button(__('Send Test Template WhatsApp'), function() {
			show_test_template_message_dialog(frm);
		}, __('Actions'));

			frm.add_custom_button(__('Fetch Templates from Digital Connect'), function() {
				show_fetch_templates_dialog_from_settings();
			}, __('Templates'));
		}
	},
});

function show_test_message_dialog(frm) {
	let fields = [
		{
			fieldname: 'message_type',
			label: __('Message Type'),
			fieldtype: 'Select',
			options: '\nPlain Text\nTemplate',
			default: 'Plain Text',
			reqd: 1,
		},
		{
			fieldname: 'template',
			label: __('Template'),
			fieldtype: 'Link',
			options: 'Digital Whatsapp Template',
			filters: {
				status: 'APPROVED'
			},
			reqd: 0,
			depends_on: 'eval:doc.message_type == "Template"',
			get_query: function() {
				return {
					filters: {
						status: 'APPROVED'
					}
				};
			}
		},
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
			reqd: 0,
			default: 'Please visit https://just-visit',
			depends_on: 'eval:doc.message_type == "Plain Text"',
		},
		{
			fieldname: 'preview_url',
			label: __('Enable URL Preview'),
			fieldtype: 'Check',
			default: 1,
			depends_on: 'eval:doc.message_type == "Plain Text"',
		},
		{
			fieldname: 'template_parameters',
			label: __('Template Parameters'),
			fieldtype: 'Small Text',
			description: __('Comma-separated values for template variables (e.g., value1, value2, value3)'),
			depends_on: 'eval:doc.message_type == "Template"',
		}
	];
	
	let dialog = new frappe.ui.Dialog({
		title: __('Send Test WhatsApp'),
		fields: fields,
		primary_action_label: __('Send'),
		primary_action(values) {
			// Validate based on message type
			if (values.message_type === 'Template') {
				if (!values.template) {
					frappe.msgprint({
						title: __('Validation Error'),
						message: __('Please select a template.'),
						indicator: 'red'
					});
					return;
				}
			} else {
				if (!values.body) {
					frappe.msgprint({
						title: __('Validation Error'),
						message: __('Message body is required for plain text messages.'),
						indicator: 'red'
					});
					return;
				}
			}
			
			send_test_whatsapp_message(frm, values);
			dialog.hide();
		}
	});
	
	// Add onchange handlers after dialog is created
	dialog.fields_dict.message_type.df.onchange = function() {
		let message_type = this.get_value();
		let template_field = dialog.fields_dict.template;
		let body_field = dialog.fields_dict.body;
		
		if (message_type === 'Template') {
			template_field.df.reqd = 1;
			template_field.refresh();
			body_field.df.reqd = 0;
			body_field.refresh();
		} else {
			template_field.df.reqd = 0;
			template_field.refresh();
			body_field.df.reqd = 1;
			body_field.refresh();
		}
	};
	
	// Add onchange for template selection to show parameter count
	if (dialog.fields_dict.template) {
		dialog.fields_dict.template.df.onchange = function() {
			let template_name = this.get_value();
			if (template_name) {
				// Fetch template to count variables
				frappe.db.get_doc('Digital Whatsapp Template', template_name).then(function(template_doc) {
					// Count variables in template text
					function countVariables(text) {
						if (!text) return 0;
						let matches = text.match(/\{\{(\d+)\}\}/g);
						if (!matches) return 0;
						let maxVar = Math.max(...matches.map(m => parseInt(m.match(/\d+/)[0])));
						return maxVar;
					}
					
					let headerVars = 0;
					if (template_doc.header_type === 'TEXT' && template_doc.header_text) {
						headerVars = countVariables(template_doc.header_text);
					}
					
					let bodyVars = 0;
					if (template_doc.body_text) {
						bodyVars = countVariables(template_doc.body_text);
					}
					
					let totalVars = headerVars + bodyVars;
					let paramField = dialog.fields_dict.template_parameters;
					
					if (totalVars > 0) {
						paramField.df.description = __(
							'This template requires {0} parameter(s) (Header: {1}, Body: {2}). ' +
							'Enter comma-separated values (e.g., value1, value2, value3)',
							[totalVars, headerVars, bodyVars]
						);
					} else {
						paramField.df.description = __('This template has no variables. Leave empty or omit this field.');
					}
					paramField.refresh();
				});
			}
		};
	}
	
	dialog.show();
}

function send_test_whatsapp_message(frm, values) {
	let args = {
		phone_number: values.phone_number,
	};
	
	if (values.message_type === 'Template') {
		if (!values.template) {
			frappe.msgprint({
				title: __('Validation Error'),
				message: __('Please select a template.'),
				indicator: 'red'
			});
			return;
		}
		args.template_name = values.template;
		args.template_parameters = values.template_parameters || '';
	} else {
		if (!values.body) {
			frappe.msgprint({
				title: __('Validation Error'),
				message: __('Message body is required for plain text messages.'),
				indicator: 'red'
			});
			return;
		}
		args.body = values.body;
		args.preview_url = values.preview_url ? 1 : 0;
	}
	
	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings.send_test_message',
		args: args,
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

function show_test_template_message_dialog(frm) {
	let dialog = new frappe.ui.Dialog({
		title: __('Send Test Template WhatsApp'),
		fields: [
			{
				fieldname: 'template',
				label: __('Template'),
				fieldtype: 'Link',
				options: 'Digital Whatsapp Template',
				reqd: 1,
				filters: {
					status: 'APPROVED'
				},
				get_query: function() {
					return {
						filters: {
							status: 'APPROVED'
						}
					};
				}
			},
			{
				fieldname: 'phone_number',
				label: __('Phone Number'),
				fieldtype: 'Data',
				reqd: 1,
				description: __('Enter phone number in international format (e.g., 254740743521)')
			},
			{
				fieldname: 'template_parameters',
				label: __('Template Parameters'),
				fieldtype: 'Small Text',
				description: __('Comma-separated values for template variables'),
			}
		],
		primary_action_label: __('Send'),
		primary_action(values) {
			if (!values.template) {
				frappe.msgprint({
					title: __('Validation Error'),
					message: __('Please select a template.'),
					indicator: 'red'
				});
				return;
			}
			send_test_template_whatsapp_message(frm, values);
			dialog.hide();
		}
	});

	// Show dynamic parameter guidance based on selected template variables
	if (dialog.fields_dict.template) {
		dialog.fields_dict.template.df.onchange = function() {
			let template_name = this.get_value();
			if (!template_name) return;

			frappe.db.get_doc('Digital Whatsapp Template', template_name).then(function(template_doc) {
				function countVariables(text) {
					if (!text) return 0;
					let matches = text.match(/\{\{(\d+)\}\}/g);
					if (!matches) return 0;
					return Math.max(...matches.map(m => parseInt(m.match(/\d+/)[0])));
				}

				let headerVars = 0;
				if (template_doc.header_type === 'TEXT' && template_doc.header_text) {
					headerVars = countVariables(template_doc.header_text);
				}
				let bodyVars = countVariables(template_doc.body_text);
				let totalVars = headerVars + bodyVars;
				let paramField = dialog.fields_dict.template_parameters;

				if (totalVars > 0) {
					paramField.df.description = __(
						'Template requires {0} parameter(s) (Header: {1}, Body: {2}). Enter comma-separated values.',
						[totalVars, headerVars, bodyVars]
					);
				} else {
					paramField.df.description = __('This template has no variables. Leave parameters empty.');
				}
				paramField.refresh();
			});
		};
	}

	dialog.show();
}

function send_test_template_whatsapp_message(frm, values) {
	frappe.call({
		method: 'healthcare.healthcare.doctype.digital_connect_whatsap_settings.digital_connect_whatsap_settings.send_test_message',
		args: {
			phone_number: values.phone_number,
			template_name: values.template,
			template_parameters: values.template_parameters || '',
		},
		freeze: true,
		freeze_message: __('Sending template test message...'),
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

				frappe.show_alert({
					message: __('Template test message sent successfully!'),
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
				fieldtype: 'HTML',
				fieldname: 'help',
				options: `<div class="text-muted small" style="margin-bottom: 12px;">
					${__('All filters are optional. Leave every field blank and click Fetch to load all templates your API key can access.')}
				</div>`,
			},
			{
				fieldname: 'category',
				label: __('Category'),
				fieldtype: 'Select',
				options: '\nAUTHENTICATION\nMARKETING\nUTILITY',
				description: __('Optional. Use exact values such as UTILITY.'),
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
