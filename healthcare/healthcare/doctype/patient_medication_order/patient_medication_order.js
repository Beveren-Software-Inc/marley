// Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Patient Medication Order', {
	refresh: function(frm) {
		if (frm.doc.docstatus === 1) {
			frm.trigger("show_progress");
		}

		frm.events.show_medication_order_button(frm);
		frm.events.show_get_from_encounter_button(frm);
		frm.events.show_subscription_button(frm);

		// frm.set_query('patient', () => {
		// 	return {
		// 		filters: {
		// 			'inpatient_record': ['!=', ''],
		// 			'inpatient_status': 'Admitted'
		// 		}
		// 	};
		// });
	},

	show_medication_order_button: function(frm) {
		frm.fields_dict['medication_orders'].grid.wrapper.find('.grid-add-row').hide();
		frm.fields_dict['medication_orders'].grid.add_custom_button(__('Add Medication Orders'), () => {
			let d = new frappe.ui.Dialog({
				title: __('Add Medication Orders'),
				fields: [
					{
						fieldname: 'drug_code',
						label: __('Drug'),
						fieldtype: 'Link',
						options: 'Item',
						reqd: 1,
						"get_query": function () {
							return {
								filters: {'is_stock_item': 1}
							};
						}
					},
					{
						fieldname: 'dosage',
						label: __('Dosage'),
						fieldtype: 'Link',
						options: 'Prescription Dosage',
						reqd: 1
					},
					{
						fieldname: 'period',
						label: __('Period'),
						fieldtype: 'Link',
						options: 'Prescription Duration',
						reqd: 1
					},
					{
						fieldname: 'dosage_form',
						label: __('Dosage Form'),
						fieldtype: 'Link',
						options: 'Dosage Form',
						reqd: 1
					}
				],
				primary_action_label: __('Add'),
				primary_action: () => {
					let values = d.get_values();
					if (values) {
						frm.call({
							doc: frm.doc,
							method: 'add_order_entries',
							args: {
								order: values
							},
							freeze: true,
							freeze_message: __('Adding Order Entries'),
							callback: function() {
								frm.refresh_field('medication_orders');
							}
						});
					}
				},
			});
			d.show();
		});
	},

	show_get_from_encounter_button: function(frm) {
		frm.fields_dict['medication_orders'].grid.add_custom_button(__('Get From Encounter'), () => {
			if (!frm.doc.patient_encounter) {
				frappe.throw(__("Please select a Patient Visit to get from"));
			}
			frm.call({
				doc: frm.doc,
				method: 'get_from_encounter',
				args: {
					encounter: frm.doc.patient_encounter
				},
				freeze: true,
				freeze_message: __('Getting From Encounter'),
				callback: function() {
					frm.refresh_field('medication_orders');
				}
			});
		});
	},

	show_subscription_button: function(frm) {
		if (!frm.doc.patient || !frm.doc.medication_orders?.length) {
			return;
		}

		frm.add_custom_button(__('Medication Subscription Plan'), () => {
			const data = (frm.doc.medication_orders || []).map(row => ({
				medication_order_entry: row.name,
				drug: row.drug,
				drug_name: row.drug_name,
				dosage: row.dosage,
				dosage_form: row.dosage_form,
				instructions: row.instructions,
				patient_frequency: row.patient_frequency,
				date: row.date,
				time: row.time,
				qty_per_cycle: 1,
				is_active: 1,
			}));

			let d = new frappe.ui.Dialog({
				title: __('Medication Subscription Plan'),
				fields: [
					{
						fieldname: 'info',
						fieldtype: 'HTML',
						options:
							'<div class="text-muted mb-2">' +
							__('Select medications to include in this subscription plan. You can edit full details in the Subscription Medication Plan after it is created.') +
							'</div>',
					},
					{
						fieldname: 'medications',
						fieldtype: 'Table',
						label: __('Medications'),
						in_place_edit: true,
						data: data,
						fields: [
							{
								fieldname: 'medication_order_entry',
								fieldtype: 'Data',
								hidden: 1,
							},
							{
								fieldname: 'drug',
								fieldtype: 'Link',
								label: __('Drug'),
								options: 'Item',
								in_list_view: 1,
								reqd: 1,
							},
							{
								fieldname: 'drug_name',
								fieldtype: 'Data',
								label: __('Drug Name'),
								read_only: 1,
								in_list_view: 1,
							},
							{
								fieldname: 'dosage',
								fieldtype: 'Float',
								label: __('Dosage'),
								in_list_view: 1,
							},
							{
								fieldname: 'dosage_form',
								fieldtype: 'Link',
								label: __('Dosage Form'),
								options: 'Dosage Form',
								in_list_view: 1,
							},
							{
								fieldname: 'patient_frequency',
								fieldtype: 'Link',
								label: __('Patient Frequency'),
								options: 'Prescription Dosage',
								in_list_view: 1,
							},
							{
								fieldname: 'date',
								fieldtype: 'Date',
								label: __('Date'),
							},
							{
								fieldname: 'time',
								fieldtype: 'Time',
								label: __('Time'),
							},
							{
								fieldname: 'qty_per_cycle',
								fieldtype: 'Float',
								label: __('Qty per Cycle'),
								in_list_view: 1,
							},
							{
								fieldname: 'is_active',
								fieldtype: 'Check',
								label: __('Include'),
								default: 1,
								in_list_view: 1,
							},
						],
					},
					{
						fieldname: 'frequency',
						fieldtype: 'Select',
						label: __('Frequency'),
						options: ['Monthly', 'Every 2 Months', 'Every 3 Months'],
						default: 'Monthly',
						reqd: 1,
					},
					{
						fieldname: 'start_date',
						fieldtype: 'Date',
						label: __('Start Date'),
						default: frm.doc.start_date || frappe.datetime.get_today(),
					},
					{
						fieldname: 'end_date',
						fieldtype: 'Date',
						label: __('End Date'),
					},
				],
				primary_action_label: __('Create Plan'),
				primary_action: () => {
					const values = d.get_values();
					const meds = (values.medications || []).filter(row => row.drug && row.is_active);

					if (!meds.length) {
						frappe.msgprint(__('Please add at least one medication (or mark Include = 1).'));
						return;
					}

					frm.call({
						method: 'create_subscription_plan',
						doc: frm.doc,
						args: {
							medications: meds,
							frequency: values.frequency,
							start_date: values.start_date,
							end_date: values.end_date,
						},
						freeze: true,
						freeze_message: __('Creating Subscription Medication Plan'),
						callback: (r) => {
							if (r && r.message) {
								frappe.msgprint(
									__('Subscription Medication Plan {0} created. Next run date: {1}', [
										r.message.name,
										r.message.next_run_date || '',
									])
								);
								// Go to the plan so user can see/edit the child table
								frappe.set_route('Form', 'Subscription Medication Plan', r.message.name);
							}
							d.hide();
						},
					});
				},
			});

			d.show();
		}, __('Create'));
	},

	show_progress: function(frm) {
		let bars = [];
		let message = '';

		// completed sessions
		let title = __('{0} medication orders completed', [frm.doc.completed_orders]);
		if (frm.doc.completed_orders === 1) {
			title = __('{0} medication order completed', [frm.doc.completed_orders]);
		}
		title += __(' out of {0}', [frm.doc.total_orders]);

		bars.push({
			'title': title,
			'width': (frm.doc.completed_orders / frm.doc.total_orders * 100) + '%',
			'progress_class': 'progress-bar-success'
		});
		if (bars[0].width == '0%') {
			bars[0].width = '0.5%';
		}
		message = title;
		frm.dashboard.add_progress(__('Status'), bars, message);
	}
});
