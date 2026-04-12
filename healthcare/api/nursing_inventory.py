# healthcare/api/nursing_inventory.py

import frappe
from frappe import _
from frappe.utils import today, nowdate, getdate
from frappe.model.document import Document

@frappe.whitelist()
def get_stock_ledger(cost_center):
    """
    Get stock ledger for a specific cost center
    Returns list of items with current stock quantities
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Get all item stocks from Stock Ledger Entry or custom Nursing Stock table
    # Assuming you have a custom DocType 'Nursing Stock Ledger'
    stock_items = frappe.db.sql("""
        SELECT 
            item_code,
            item_name,
            category,
            current_stock,
            reorder_level,
            uom,
            unit_price,
            last_updated
        FROM `tabNursing Stock Ledger`
        WHERE cost_center = %s
        ORDER BY item_name
    """, (cost_center,), as_dict=1)
    
    # Alternative: Use Stock Ledger Entry if you have standard ERPNext inventory
    if not stock_items:
        stock_items = frappe.db.sql("""
            SELECT 
                sle.item_code,
                i.item_name,
                i.item_group as category,
                SUM(sle.actual_qty) as current_stock,
                COALESCE(i.reorder_level, 0) as reorder_level,
                i.stock_uom as uom,
                i.valuation_rate as unit_price,
                MAX(sle.posting_date) as last_updated
            FROM `tabStock Ledger Entry` sle
            INNER JOIN `tabItem` i ON i.name = sle.item_code
            WHERE sle.warehouse IN (
                SELECT warehouse FROM `tabWarehouse` 
                WHERE cost_center = %s
            )
            GROUP BY sle.item_code
            HAVING current_stock != 0
            ORDER BY i.item_name
        """, (cost_center,), as_dict=1)
    
    return stock_items

@frappe.whitelist()
def get_inventory_items(search=None):
    """
    Get inventory items for dropdown/search
    """
    filters = {}
    if search:
        filters = {
            "item_code": ["like", f"%{search}%"],
            "item_name": ["like", f"%{search}%"]
        }
    
    items = frappe.get_all("Item", 
        filters=filters,
        fields=["item_code as code", "item_name as name", "stock_uom as uom", "valuation_rate as price"],
        limit=50
    )
    return items

@frappe.whitelist()
def create_material_request(data):
    """
    Create a Material Request document
    """
    import json
    if isinstance(data, str):
        data = json.loads(data)
    
    # Create Material Request
    mr = frappe.get_doc({
        "doctype": "Material Request",
        "material_request_type": "Material Transfer",
        "transaction_date": data.get("request_date", today()),
        "schedule_date": data.get("request_date", today()),
        "cost_center": data.get("cost_center"),
        "customer": data.get("cost_center"),  # Or link to patient if needed
        "custom_notes": data.get("notes", ""),
        "items": []
    })
    
    # Add items
    for item in data.get("items", []):
        mr.append("items", {
            "item_code": item.get("item_code"),
            "item_name": item.get("item_name"),
            "qty": item.get("quantity"),
            "uom": item.get("uom"),
            "description": item.get("notes", "")
        })
    
    mr.insert()
    mr.submit()
    
    # Update status to Submitted
    frappe.db.set_value("Material Request", mr.name, "status", "Submitted")
    
    return {"name": mr.name}

@frappe.whitelist()
def get_material_requests(cost_center, status=None):
    """
    Get material requests for a cost center
    """
    filters = {"cost_center": cost_center}
    if status:
        filters["status"] = status
    
    requests = frappe.get_all("Material Request",
        filters=filters,
        fields=["name", "transaction_date as request_date", "status", "custom_notes as notes",
                "material_request_type", "per_ordered", "per_received"],
        order_by="creation desc"
    )
    
    # Get items for each request
    for req in requests:
        req["items"] = frappe.get_all("Material Request Item",
            filters={"parent": req["name"]},
            fields=["item_code", "item_name", "qty as quantity", "uom", "description as notes"]
        )
        req["requested_by"] = frappe.db.get_value("Material Request", req["name"], "owner")
    
    return requests

@frappe.whitelist()
def create_stock_reconciliation(data):
    """
    Create Stock Reconciliation document to adjust inventory
    """
    import json
    if isinstance(data, str):
        data = json.loads(data)
    
    # Create Stock Reconciliation
    sr = frappe.get_doc({
        "doctype": "Stock Reconciliation",
        "purpose": "Stock Reconciliation",
        "posting_date": data.get("reconciliation_date", today()),
        "cost_center": data.get("cost_center"),
        "items": []
    })
    
    # Add items with adjustments
    for item in data.get("items", []):
        if item.get("difference") != 0:
            sr.append("items", {
                "item_code": item.get("item_code"),
                "item_name": item.get("item_name"),
                "qty": item.get("physical_quantity"),
                "valuation_rate": 0,  # Will be auto-filled
                "current_qty": item.get("system_quantity"),
                "current_valuation_rate": 0,
                "current_amount": 0,
                "amount": 0,
                "warehouse": get_warehouse_for_cost_center(data.get("cost_center"))
            })
    
    sr.insert()
    sr.submit()
    
    # Create reconciliation record
    reconciliation = frappe.get_doc({
        "doctype": "Nursing Stock Reconciliation",
        "cost_center": data.get("cost_center"),
        "reconciliation_date": data.get("reconciliation_date"),
        "reconciled_by": data.get("reconciled_by"),
        "status": data.get("status", "Completed")
    })
    
    for item in data.get("items", []):
        if item.get("difference") != 0:
            reconciliation.append("items", {
                "item_code": item.get("item_code"),
                "item_name": item.get("item_name"),
                "system_quantity": item.get("system_quantity"),
                "physical_quantity": item.get("physical_quantity"),
                "difference": item.get("difference"),
                "notes": item.get("notes", "")
            })
    
    reconciliation.insert()
    
    return {"name": reconciliation.name}

@frappe.whitelist()
def get_stock_reconciliations(cost_center):
    """
    Get stock reconciliations for a cost center
    """
    reconciliations = frappe.get_all("Nursing Stock Reconciliation",
        filters={"cost_center": cost_center},
        fields=["name", "reconciliation_date", "reconciled_by", "status"],
        order_by="creation desc"
    )
    
    for rec in reconciliations:
        rec["items"] = frappe.get_all("Nursing Stock Reconciliation Item",
            filters={"parent": rec["name"]},
            fields=["item_code", "item_name", "system_quantity", "physical_quantity", "difference", "notes"]
        )
    
    return reconciliations

@frappe.whitelist()
def create_material_receipt(data):
    """
    Create Purchase Receipt for materials
    """
    import json
    if isinstance(data, str):
        data = json.loads(data)
    
    # Get warehouse for cost center
    warehouse = get_warehouse_for_cost_center(data.get("cost_center"))
    
    # Create Purchase Receipt
    pr = frappe.get_doc({
        "doctype": "Purchase Receipt",
        "posting_date": data.get("receipt_date", today()),
        "supplier": data.get("supplier"),
        "bill_no": data.get("invoice_number"),
        "set_warehouse": warehouse,
        "items": []
    })
    
    total_amount = 0
    for item in data.get("items", []):
        pr.append("items", {
            "item_code": item.get("item_code"),
            "item_name": item.get("item_name"),
            "qty": item.get("quantity"),
            "rate": item.get("unit_price"),
            "amount": item.get("total_price"),
            "warehouse": warehouse,
            "batch_no": item.get("batch_number"),
            "expiry_date": item.get("expiry_date")
        })
        total_amount += item.get("total_price", 0)
    
    pr.total = total_amount
    pr.grand_total = total_amount
    pr.insert()
    pr.submit()
    
    # Create receipt record
    receipt = frappe.get_doc({
        "doctype": "Nursing Material Receipt",
        "cost_center": data.get("cost_center"),
        "receipt_date": data.get("receipt_date"),
        "supplier": data.get("supplier"),
        "invoice_number": data.get("invoice_number"),
        "total_amount": total_amount,
        "received_by": data.get("received_by"),
        "status": data.get("status", "Completed")
    })
    
    for item in data.get("items", []):
        receipt.append("items", {
            "item_code": item.get("item_code"),
            "item_name": item.get("item_name"),
            "quantity": item.get("quantity"),
            "unit_price": item.get("unit_price"),
            "total_price": item.get("total_price"),
            "batch_number": item.get("batch_number"),
            "expiry_date": item.get("expiry_date")
        })
    
    receipt.insert()
    
    return {"name": receipt.name}

@frappe.whitelist()
def get_material_receipts(cost_center):
    """
    Get material receipts for a cost center
    """
    receipts = frappe.get_all("Nursing Material Receipt",
        filters={"cost_center": cost_center},
        fields=["name", "receipt_date", "supplier", "invoice_number", "total_amount", "received_by", "status"],
        order_by="creation desc"
    )
    
    for receipt in receipts:
        receipt["items"] = frappe.get_all("Nursing Material Receipt Item",
            filters={"parent": receipt["name"]},
            fields=["item_code", "item_name", "quantity", "unit_price", "total_price", "batch_number", "expiry_date"]
        )
    
    return receipts

@frappe.whitelist()
def get_user_cost_centers():
    """
    Get cost centers assigned to the current user
    """
    user = frappe.session.user
    
    # Get cost centers from user permissions or from employee record
    cost_centers = frappe.db.sql("""
        SELECT DISTINCT 
            cc.name,
            cc.cost_center_name as label
        FROM `tabCost Center` cc
        WHERE cc.name IN (
            SELECT DISTINCT for_value 
            FROM `tabUser Permission` 
            WHERE user = %s AND allow = 'Cost Center'
        )
        OR cc.parent_cost_center IN (
            SELECT DISTINCT for_value 
            FROM `tabUser Permission` 
            WHERE user = %s AND allow = 'Cost Center'
        )
        LIMIT 10
    """, (user, user), as_dict=1)
    
    if not cost_centers:
        # Fallback: get cost centers from employee record
        employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if employee:
            cost_centers = frappe.db.sql("""
                SELECT 
                    cc.name,
                    cc.cost_center_name as label
                FROM `tabCost Center` cc
                WHERE cc.name = (
                    SELECT cost_center FROM `tabEmployee` WHERE name = %s
                )
            """, employee, as_dict=1)
    
    return cost_centers

def get_warehouse_for_cost_center(cost_center):
    """
    Get warehouse linked to a cost center
    """
    warehouse = frappe.db.get_value("Warehouse", {"cost_center": cost_center}, "name")
    if not warehouse:
        warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": cost_center}, "name")
    if not warehouse:
        warehouse = "Stores - W"
    return warehouse