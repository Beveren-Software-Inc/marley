frappe.ui.form.on("Item Group", {
	refresh: function (frm) {
		const itemGroupName = frm.doc.name;

		frm.add_custom_button(
			__("Remove VAT Category from Items in this Group"),
			function () {
				frappe.confirm(
					__(
						"This will remove the VAT Category from the Item Tax Template child table on ALL items belonging to the Item Group: {0}. This runs in the background. Continue?",
						[itemGroupName]
					),
					function () {
						frappe.call({
							method:
								"healthcare.api.remove_vat_category.remove_vat_category_from_items",
							args: {
								item_group: itemGroupName,
							},
							callback: function (r) {
								if (r.message && r.message.status === "queued") {
									frappe.msgprint(
										__(
											"VAT Category removal has been queued for Item Group {0} and will run in the background. You can continue working.",
											[itemGroupName]
										)
									);
								}
							},
							error: function (err) {
								frappe.msgprint(
									__("Failed to start VAT Category removal: {0}", [err.message])
								);
							},
						});
					}
				);
			}
		);
	},
});