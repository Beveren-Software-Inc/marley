// Copyright (c) 2025, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Health Insurance", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Upload Price Lists"), () => {
				open_price_list_upload_dialog(frm);
			}, __("Actions"));

			frm.add_custom_button(__("Fetch Inclusive Items"), () => {
				frappe.call({
					method:
						"healthcare.healthcare.doctype.health_insurance.health_insurance.fetch_inclusive_items",
					args: {
						docname: frm.doc.name,
					},
					freeze: true,
					callback() {
						frm.reload_doc();
					},
				});
			}, __("Actions"));

			frm.add_custom_button(__("Fetch Exclusive Items"), () => {
				frappe.call({
					method:
						"healthcare.healthcare.doctype.health_insurance.health_insurance.fetch_exclusive_items",
					args: {
						docname: frm.doc.name,
					},
					freeze: true,
					callback() {
						frm.reload_doc();
					},
				});
			}, __("Actions"));
		}
	},
});

function open_price_list_upload_dialog(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Upload Insurance Price Lists"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "help",
				options: `<p class="text-muted small">${__(
					"Upload the three agreed Excel price lists. Rows are added to the Inclusive Items table with lab test / healthcare service links and Discount Apply checked only where the file indicates a discount."
				)}</p>`,
			},
			{
				label: __("Lab Tests Price List"),
				fieldname: "lab_file",
				fieldtype: "Attach",
				description: __(
					"TOP - SPH - In House and Out Sourced Lab Tests Price List"
				),
			},
			{
				label: __("In Patient Price List"),
				fieldname: "ip_file",
				fieldtype: "Attach",
				description: __("TOP - SPH - In Patient Price List"),
			},
			{
				label: __("IOP Price List"),
				fieldname: "iop_file",
				fieldtype: "Attach",
				description: __("TOP - SPH - IOP Price List"),
			},
		],
		primary_action_label: __("Import to Inclusive Items"),
		primary_action(values) {
			if (!values.lab_file && !values.ip_file && !values.iop_file) {
				frappe.msgprint(__("Upload at least one Excel file."));
				return;
			}

			frappe.call({
				method:
					"healthcare.api.health_insurance_price_list_import.import_inclusive_items_from_price_lists",
				args: {
					docname: frm.doc.name,
					lab_file_url: values.lab_file || null,
					ip_file_url: values.ip_file || null,
					iop_file_url: values.iop_file || null,
				},
				freeze: true,
				freeze_message: __("Importing price lists…"),
				callback(r) {
					const result = r.message || {};
					if (!result.ok) {
						return;
					}

					let details = result.message || __("Import completed.");
					if (result.missing_count) {
						const sample = (result.missing_sample || []).join("\n");
						details += `\n\n${__("Unmatched rows")}: ${result.missing_count}`;
						if (sample) {
							details += `\n\n${sample}`;
						}
					}

					frappe.msgprint({
						title: __("Inclusive Items Updated"),
						message: details.replace(/\n/g, "<br>"),
						indicator: "green",
					});
					dialog.hide();
					frm.reload_doc();
				},
			});
		},
	});

	dialog.show();
}
