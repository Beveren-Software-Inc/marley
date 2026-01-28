frappe.ui.form.on('Subscription Medication Plan', {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			// Create group: Medication Order + new Subscription Medication Plan
			frm.add_custom_button(__('Medication Order'), () => {
				frm.call({
					method: 'create_medication_order_now',
					doc: frm.doc,
					freeze: true,
					freeze_message: __('Creating Medication Order'),
					callback(r) {
						if (r && r.message && r.message.name) {
							frappe.msgprint(
								__('Medication Order {0} created from this plan.', [r.message.name])
							);
							frappe.set_route('Form', 'Patient Medication Order', r.message.name);
						}
					},
				});
			}, __('Create'));

			frm.add_custom_button(__('Subscription Medication Plan'), () => {
				// Open a fresh Subscription Medication Plan (user can build a new plan)
				frappe.new_doc('Subscription Medication Plan');
			}, __('Create'));
		}
	},
});

