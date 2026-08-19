import frappe
from frappe import _


def _remove_vat_category_job(item_group=None):
	"""Remove VAT Category from the Item Tax child table on Items belonging to the given Item Group."""
	filters = {}
	if item_group:
		filters["item_group"] = item_group

	items = frappe.get_all("Item", filters=filters, fields=["name"], limit_page_length=0)
	changed = []
	for item in items:
		doc = frappe.get_doc("Item", item.name)
		dirty = False
		# The child table on Item is `taxes` (doctype "Item Tax"),
		# and the field to clear is `tax_category`.
		for row in doc.get("taxes") or []:
			if hasattr(row, "tax_category") and row.tax_category:
				row.tax_category = None
				dirty = True
		if dirty:
			try:
				doc.save(ignore_permissions=True)
				changed.append(item.name)
			except Exception:
				frappe.log_error(frappe.get_traceback(), f"vat_category remove failed: {item.name}")
	return {"item_group": item_group, "changed_count": len(changed), "changed_items": changed}


@frappe.whitelist()
def remove_vat_category_from_items(item_group=None):
	item_group = (item_group or "").strip() or None
	if not item_group:
		frappe.throw(_("Item Group is required"))

	frappe.enqueue(
		"healthcare.api.remove_vat_category._remove_vat_category_job",
		queue="long",
		timeout=7200,
		enqueue_after_commit=True,
		item_group=item_group,
	)
	return {
		"status": "queued",
		"message": _("VAT Category removal started for Item Group {0} in the background.").format(
			item_group
		),
	}
