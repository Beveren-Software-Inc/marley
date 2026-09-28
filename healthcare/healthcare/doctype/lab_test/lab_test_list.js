/*
(c) ESS 2015-16
*/
frappe.listview_settings['Lab Test'] = {
	add_fields: ['name', 'status', 'invoiced'],
	filters: [['docstatus', '=', '1']],
	get_indicator: function (doc) {
		if (doc.status === 'Reviewed') {
			return [__('Reviewed'), 'green', 'status, =, Reviewed'];
		} else if (doc.status === 'Rejected') {
			return [__('Rejected'), 'orange', 'status, =, Rejected'];
		} else if (doc.status === 'Completed') {
			return [__('Completed'), 'green', 'status, =, Completed'];
		} else if (doc.status === 'Cancelled') {
			return [__('Cancelled'), 'red', 'status, =, Cancelled'];
		}
	},
	onload: function (listview) {
		listview.page.add_menu_item(__('Create Multiple'), function () {
			create_multiple_dialog(listview);
		});

		// LAB-039 override. A Lab Test whose sample is already with the lab may not be
		// deleted or cancelled by the normal path, so System Managers get the same
		// force actions the health SPA exposes.
		if (frappe.user.has_role('System Manager')) {
			listview.page.add_menu_item(__('Force Delete Lab Test'), function () {
				force_override_selected_lab_tests(listview, 'delete');
			});
			listview.page.add_menu_item(__('Force Cancel Lab Test'), function () {
				force_override_selected_lab_tests(listview, 'cancel');
			});
		}
	}
};

var force_override_selected_lab_tests = function (listview, action) {
	var selected = listview.get_checked_items() || [];
	if (!selected.length) {
		frappe.msgprint(__('Select at least one Lab Test first.'));
		return;
	}

	var is_cancel = action === 'cancel';
	var method = is_cancel
		? 'healthcare.api.lab_request_actions.force_cancel_lab_test'
		: 'healthcare.api.lab_request_actions.force_delete_lab_test';
	var action_label = is_cancel ? __('Force Cancel') : __('Force Delete');

	frappe.confirm(
		__('{0} {1} selected Lab Test(s), overriding the recorded sample collection?', [
			action_label,
			selected.length
		]),
		function () {
			frappe.prompt(
				{
					fieldtype: 'Small Text',
					fieldname: 'reason',
					label: __('Reason'),
					description: __('Recorded against the override for audit.')
				},
				function (values) {
					var pending = selected.slice();
					var failed = [];

					var run_next = function () {
						if (!pending.length) {
							if (failed.length) {
								frappe.msgprint(
									__('{0} of the Lab Test(s) could not be processed: {1}', [
										failed.length,
										failed.join(', ')
									])
								);
							}
							listview.refresh();
							return;
						}

						var row = pending.shift();
						frappe.call({
							method: method,
							args: { lab_test_name: row.name, reason: values.reason || null },
							callback: function (data) {
								if (data.exc) {
									failed.push(row.name);
								}
								run_next();
							},
							error: function () {
								failed.push(row.name);
								run_next();
							}
						});
					};

					run_next();
				},
				action_label,
				__('Proceed')
			);
		}
	);
};

var create_multiple_dialog = function (listview) {
	var dialog = new frappe.ui.Dialog({
		title: 'Create Multiple Lab Tests',
		width: 100,
		fields: [
			{ fieldtype: 'Link', label: 'Patient', fieldname: 'patient', options: 'Patient', reqd: 1 },
			{
				fieldtype: 'Select', label: 'Invoice / Patient Visit', fieldname: 'doctype',
				options: '\nSales Invoice\nPatient Visit', reqd: 1
			},
			{
				fieldtype: 'Dynamic Link', fieldname: 'docname', options: 'doctype', reqd: 1,
				get_query: function () {
					return {
						filters: {
							'patient': dialog.get_value('patient'),
							'docstatus': 1
						}
					};
				}
			}
		],
		primary_action_label: __('Create'),
		primary_action: function () {
			frappe.call({
				method: 'healthcare.healthcare.doctype.lab_test.lab_test.create_multiple',
				args: {
					'doctype': dialog.get_value('doctype'),
					'docname': dialog.get_value('docname')
				},
				callback: function (data) {
					if (!data.exc) {
						if (!data.message) {
							frappe.msgprint(__('No Lab Tests created'));
						}
						listview.refresh();
					}
				},
				freeze: true,
				freeze_message: __('Creating Lab Tests...')
			});
			dialog.hide();
		}
	});

	dialog.show();
};
