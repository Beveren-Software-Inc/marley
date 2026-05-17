// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Lab Test Result Rule', {
	refresh(frm) {
		if (!frm.doc.lab_test_template) {
			return;
		}

		frm.set_query('lab_test_event', 'sum_events', () => ({
			filters: [['Lab Test Template', 'lab_group', '=', frm.doc.lab_test_template]],
		}));

		if (frm.is_new()) {
			return;
		}

		frm.add_custom_button(__('Load Group Child Tests'), () => {
			frappe.call({
				method: 'healthcare.api.lab_test_result_rules.get_group_child_sum_events',
				args: { parent_template: frm.doc.lab_test_template },
				callback(r) {
					const children = r.message || [];
					if (!children.length) {
						frappe.msgprint(
							__(
								'No child tests found. Link child templates to this panel using Parent Group = {0}, or add them on the group template table.',
								[frm.doc.lab_test_template]
							)
						);
						return;
					}
					frm.clear_table('sum_events');
					children.forEach((child) => {
						const row = frm.add_child('sum_events');
						row.lab_test_event = child.lab_test_event;
					});
					frm.refresh_field('sum_events');
					frappe.show_alert({
						message: __(
							'Loaded {0} child test(s). Remove any that are not part of the sum to {1}.',
							[children.length, frm.doc.sum_target || 100]
						),
						indicator: 'green',
					});
				},
			});
		});
	},
});
