import frappe

def _remove_vat_category_job():
	items = frappe.get_all("Item", fields=["name"], limit_page_length=0)
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
	return {"changed_count": len(changed), "changed_items": changed}

@frappe.whitelist()
def remove_vat_category_from_items():
	frappe.enqueue(
		"healthcare.api.remove_vat_category._remove_vat_category_job",
		queue="long",
		timeout=7200,
		enqueue_after_commit=True,
	)
	return {"status": "queued", "message": "VAT Category removal started in the background. You can continue working."}