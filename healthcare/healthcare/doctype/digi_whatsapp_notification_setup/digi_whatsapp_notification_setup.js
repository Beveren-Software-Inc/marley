frappe.ui.form.on("Digi Whatsapp Notification Setup", {
	refresh(frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__("Send Test Notification"), () => {
			const dialog = new frappe.ui.Dialog({
				title: __("Send Test Notification"),
				fields: [
					{
						fieldname: "reference_name",
						fieldtype: "Data",
						label: __("Reference Document Name"),
						reqd: 1,
					},
					{
						fieldname: "override_phone",
						fieldtype: "Data",
						label: __("Override Phone (optional)"),
						description: __("Use this phone only for this test send"),
					},
				],
				primary_action_label: __("Send"),
				primary_action(values) {
					frappe.call({
						method:
							"healthcare.healthcare.doctype.digi_whatsapp_notification_setup.digi_whatsapp_notification_setup.send_test_notification",
						args: {
							setup_name: frm.doc.name,
							reference_name: values.reference_name,
							override_phone: values.override_phone || null,
						},
						freeze: true,
						freeze_message: __("Sending WhatsApp notification test..."),
						callback: (r) => {
							if (r.exc) {
								frappe.msgprint({
									title: __("Error"),
									message: r.exc,
									indicator: "red",
								});
								return;
							}
							const sent = r.message?.sent || 0;
							const errors = r.message?.errors || [];
							const indicator = errors.length ? "orange" : "green";
							frappe.msgprint({
								title: __("Test Result"),
								message: __(
									"Sent: {0}<br>Errors: {1}",
									[sent, errors.length ? frappe.utils.escape_html(errors.join("\n")) : "None"]
								),
								indicator,
							});
							dialog.hide();
							frm.reload_doc();
						},
					});
				},
			});
			dialog.show();
		});
	},
});
