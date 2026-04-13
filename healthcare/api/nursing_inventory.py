# healthcare/api/nursing_inventory.py

import frappe
from frappe import _
from frappe.utils import today, nowdate, getdate, flt
import json
from healthcare.api.common import (
    get_warehouse_for_cost_center,
    get_warehouses_for_cost_center as get_cc_warehouses,
    validate_warehouse_change_permission,
    _user_is_exempt
)
#     """
#     Get stock ledger for a specific cost center
#     Returns list of items with current stock quantities
#     """
#     if not cost_center:
#         frappe.throw(_("Cost Center is required"))
    
#     # Get all item stocks from Stock Ledger Entry or custom Nursing Stock table
#     # Assuming you have a custom DocType 'Nursing Stock Ledger'
#     stock_items = frappe.db.sql("""
#         SELECT 
#             item_code,
#             item_name,
#             category,
#             current_stock,
#             reorder_level,
#             uom,
#             unit_price,
#             last_updated
#         FROM `tabNursing Stock Ledger`
#         WHERE cost_center = %s
#         ORDER BY item_name
#     """, (cost_center,), as_dict=1)
    
#     # Alternative: Use Stock Ledger Entry if you have standard ERPNext inventory
#     if not stock_items:
#         stock_items = frappe.db.sql("""
#             SELECT 
#                 sle.item_code,
#                 i.item_name,
#                 i.item_group as category,
#                 SUM(sle.actual_qty) as current_stock,
#                 COALESCE(i.reorder_level, 0) as reorder_level,
#                 i.stock_uom as uom,
#                 i.valuation_rate as unit_price,
#                 MAX(sle.posting_date) as last_updated
#             FROM `tabStock Ledger Entry` sle
#             INNER JOIN `tabItem` i ON i.name = sle.item_code
#             WHERE sle.warehouse IN (
#                 SELECT warehouse FROM `tabWarehouse` 
#                 WHERE cost_center = %s
#             )
#             GROUP BY sle.item_code
#             HAVING current_stock != 0
#             ORDER BY i.item_name
#         """, (cost_center,), as_dict=1)
    
#     return stock_items

# @frappe.whitelist()
# def get_inventory_items(search=None):
#     """
#     Get inventory items for dropdown/search
#     """
#     filters = {}
#     if search:
#         filters = {
#             "item_code": ["like", f"%{search}%"],
#             "item_name": ["like", f"%{search}%"]
#         }
    
#     items = frappe.get_all("Item", 
#         filters=filters,
#         fields=["item_code as code", "item_name as name", "stock_uom as uom", "valuation_rate as price"],
#         limit=50
#     )
#     return items

# @frappe.whitelist()
# def create_material_request(data):
#     """
#     Create a Material Request document
#     """
#     import json
#     if isinstance(data, str):
#         data = json.loads(data)
    
#     # Create Material Request
#     mr = frappe.get_doc({
#         "doctype": "Material Request",
#         "material_request_type": "Material Transfer",
#         "transaction_date": data.get("request_date", today()),
#         "schedule_date": data.get("request_date", today()),
#         "cost_center": data.get("cost_center"),
#         "customer": data.get("cost_center"),  # Or link to patient if needed
#         "custom_notes": data.get("notes", ""),
#         "items": []
#     })
    
#     # Add items
#     for item in data.get("items", []):
#         mr.append("items", {
#             "item_code": item.get("item_code"),
#             "item_name": item.get("item_name"),
#             "qty": item.get("quantity"),
#             "uom": item.get("uom"),
#             "description": item.get("notes", "")
#         })
    
#     mr.insert()
#     mr.submit()
    
#     # Update status to Submitted
#     frappe.db.set_value("Material Request", mr.name, "status", "Submitted")
    
#     return {"name": mr.name}

# @frappe.whitelist()
# def get_material_requests(cost_center, status=None):
#     """
#     Get material requests for a cost center
#     """
#     filters = {"cost_center": cost_center}
#     if status:
#         filters["status"] = status
    
#     requests = frappe.get_all("Material Request",
#         filters=filters,
#         fields=["name", "transaction_date as request_date", "status", "custom_notes as notes",
#                 "material_request_type", "per_ordered", "per_received"],
#         order_by="creation desc"
#     )
    
#     # Get items for each request
#     for req in requests:
#         req["items"] = frappe.get_all("Material Request Item",
#             filters={"parent": req["name"]},
#             fields=["item_code", "item_name", "qty as quantity", "uom", "description as notes"]
#         )
#         req["requested_by"] = frappe.db.get_value("Material Request", req["name"], "owner")
    
#     return requests

# @frappe.whitelist()
# def create_stock_reconciliation(data):
#     """
#     Create Stock Reconciliation document to adjust inventory
#     """
#     import json
#     if isinstance(data, str):
#         data = json.loads(data)
    
#     # Create Stock Reconciliation
#     sr = frappe.get_doc({
#         "doctype": "Stock Reconciliation",
#         "purpose": "Stock Reconciliation",
#         "posting_date": data.get("reconciliation_date", today()),
#         "cost_center": data.get("cost_center"),
#         "items": []
#     })
    
#     # Add items with adjustments
#     for item in data.get("items", []):
#         if item.get("difference") != 0:
#             sr.append("items", {
#                 "item_code": item.get("item_code"),
#                 "item_name": item.get("item_name"),
#                 "qty": item.get("physical_quantity"),
#                 "valuation_rate": 0,  # Will be auto-filled
#                 "current_qty": item.get("system_quantity"),
#                 "current_valuation_rate": 0,
#                 "current_amount": 0,
#                 "amount": 0,
#                 "warehouse": get_warehouse_for_cost_center(data.get("cost_center"))
#             })
    
#     sr.insert()
#     sr.submit()
    
#     # Create reconciliation record
#     reconciliation = frappe.get_doc({
#         "doctype": "Nursing Stock Reconciliation",
#         "cost_center": data.get("cost_center"),
#         "reconciliation_date": data.get("reconciliation_date"),
#         "reconciled_by": data.get("reconciled_by"),
#         "status": data.get("status", "Completed")
#     })
    
#     for item in data.get("items", []):
#         if item.get("difference") != 0:
#             reconciliation.append("items", {
#                 "item_code": item.get("item_code"),
#                 "item_name": item.get("item_name"),
#                 "system_quantity": item.get("system_quantity"),
#                 "physical_quantity": item.get("physical_quantity"),
#                 "difference": item.get("difference"),
#                 "notes": item.get("notes", "")
#             })
    
#     reconciliation.insert()
    
#     return {"name": reconciliation.name}

# @frappe.whitelist()
# def get_stock_reconciliations(cost_center):
#     """
#     Get stock reconciliations for a cost center
#     """
#     reconciliations = frappe.get_all("Nursing Stock Reconciliation",
#         filters={"cost_center": cost_center},
#         fields=["name", "reconciliation_date", "reconciled_by", "status"],
#         order_by="creation desc"
#     )
    
#     for rec in reconciliations:
#         rec["items"] = frappe.get_all("Nursing Stock Reconciliation Item",
#             filters={"parent": rec["name"]},
#             fields=["item_code", "item_name", "system_quantity", "physical_quantity", "difference", "notes"]
#         )
    
#     return reconciliations

# @frappe.whitelist()
# def create_material_receipt(data):
#     """
#     Create Purchase Receipt for materials
#     """
#     import json
#     if isinstance(data, str):
#         data = json.loads(data)
    
#     # Get warehouse for cost center
#     warehouse = get_warehouse_for_cost_center(data.get("cost_center"))
    
#     # Create Purchase Receipt
#     pr = frappe.get_doc({
#         "doctype": "Purchase Receipt",
#         "posting_date": data.get("receipt_date", today()),
#         "supplier": data.get("supplier"),
#         "bill_no": data.get("invoice_number"),
#         "set_warehouse": warehouse,
#         "items": []
#     })
    
#     total_amount = 0
#     for item in data.get("items", []):
#         pr.append("items", {
#             "item_code": item.get("item_code"),
#             "item_name": item.get("item_name"),
#             "qty": item.get("quantity"),
#             "rate": item.get("unit_price"),
#             "amount": item.get("total_price"),
#             "warehouse": warehouse,
#             "batch_no": item.get("batch_number"),
#             "expiry_date": item.get("expiry_date")
#         })
#         total_amount += item.get("total_price", 0)
    
#     pr.total = total_amount
#     pr.grand_total = total_amount
#     pr.insert()
#     pr.submit()
    
#     # Create receipt record
#     receipt = frappe.get_doc({
#         "doctype": "Nursing Material Receipt",
#         "cost_center": data.get("cost_center"),
#         "receipt_date": data.get("receipt_date"),
#         "supplier": data.get("supplier"),
#         "invoice_number": data.get("invoice_number"),
#         "total_amount": total_amount,
#         "received_by": data.get("received_by"),
#         "status": data.get("status", "Completed")
#     })
    
#     for item in data.get("items", []):
#         receipt.append("items", {
#             "item_code": item.get("item_code"),
#             "item_name": item.get("item_name"),
#             "quantity": item.get("quantity"),
#             "unit_price": item.get("unit_price"),
#             "total_price": item.get("total_price"),
#             "batch_number": item.get("batch_number"),
#             "expiry_date": item.get("expiry_date")
#         })
    
#     receipt.insert()
    
#     return {"name": receipt.name}

# @frappe.whitelist()
# def get_material_receipts(cost_center):
#     """
#     Get material receipts for a cost center
#     """
#     receipts = frappe.get_all("Nursing Material Receipt",
#         filters={"cost_center": cost_center},
#         fields=["name", "receipt_date", "supplier", "invoice_number", "total_amount", "received_by", "status"],
#         order_by="creation desc"
#     )
    
#     for receipt in receipts:
#         receipt["items"] = frappe.get_all("Nursing Material Receipt Item",
#             filters={"parent": receipt["name"]},
#             fields=["item_code", "item_name", "quantity", "unit_price", "total_price", "batch_number", "expiry_date"]
#         )
    
#     return receipts

# @frappe.whitelist()
# def get_user_cost_centers():
#     """
#     Get cost centers assigned to the current user
#     """
#     user = frappe.session.user
    
#     # Get cost centers from user permissions or from employee record
#     cost_centers = frappe.db.sql("""
#         SELECT DISTINCT 
#             cc.name,
#             cc.cost_center_name as label
#         FROM `tabCost Center` cc
#         WHERE cc.name IN (
#             SELECT DISTINCT for_value 
#             FROM `tabUser Permission` 
#             WHERE user = %s AND allow = 'Cost Center'
#         )
#         OR cc.parent_cost_center IN (
#             SELECT DISTINCT for_value 
#             FROM `tabUser Permission` 
#             WHERE user = %s AND allow = 'Cost Center'
#         )
#         LIMIT 10
#     """, (user, user), as_dict=1)
    
#     if not cost_centers:
#         # Fallback: get cost centers from employee record
#         employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
#         if employee:
#             cost_centers = frappe.db.sql("""
#                 SELECT 
#                     cc.name,
#                     cc.cost_center_name as label
#                 FROM `tabCost Center` cc
#                 WHERE cc.name = (
#                     SELECT cost_center FROM `tabEmployee` WHERE name = %s
#                 )
#             """, employee, as_dict=1)
    
#     return cost_centers

# def get_warehouse_for_cost_center(cost_center):
#     """
#     Get warehouse linked to a cost center
#     """
#     warehouse = frappe.db.get_value("Warehouse", {"cost_center": cost_center}, "name")
#     if not warehouse:
#         warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": cost_center}, "name")
#     if not warehouse:
#         warehouse = "Stores - W"
#     return warehouse

# healthcare/api/nursing_inventory.py

import frappe
from frappe import _
from frappe.utils import today, nowdate, getdate
import json
from healthcare.api.common import (
    get_warehouse_for_cost_center,
    get_warehouses_for_cost_center as get_cc_warehouses,
    validate_warehouse_change_permission,
    _user_is_exempt
)

@frappe.whitelist()
def get_stock_ledger(cost_center):
    """
    Get stock ledger for a specific cost center using warehouse from Healthcare Settings.
    
    The warehouse is automatically determined from the Healthcare Settings Nurse Mini Warehouse table
    based on the cost_center provided.
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Get warehouse from Healthcare Settings based on cost center
    warehouse = get_warehouse_for_cost_center(cost_center)
    
    if not warehouse:
        return []
    
    # Get stock from Stock Ledger Entry
    stock_items = frappe.db.sql("""
        SELECT 
            sle.item_code,
            i.item_name,
            i.item_group as category,
            SUM(sle.actual_qty) as current_stock,
            i.stock_uom as uom,
            i.valuation_rate as unit_price,
            MAX(sle.posting_date) as last_updated
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON i.name = sle.item_code
        WHERE sle.warehouse = %s
        GROUP BY sle.item_code
        HAVING current_stock != 0
        ORDER BY i.item_name
    """, (warehouse,), as_dict=1)
    
    # Get reorder levels from Item Reorder table
    reorder_map = {}
    if frappe.db.exists("DocType", "Item Reorder"):
        reorders = frappe.get_all(
            "Item Reorder",
            filters={"parenttype": "Item"},
            fields=["parent as item_code", "warehouse", "warehouse_reorder_level"],
            as_list=False,
        )
        for r in reorders:
            key = (r.get("item_code"), warehouse)  # Specific to this warehouse
            level = flt(r.get("warehouse_reorder_level")) or 0
            if level > 0:
                reorder_map[r.get("item_code")] = level
    
    # Add reorder levels to stock items
    for item in stock_items:
        item["reorder_level"] = reorder_map.get(item["item_code"], 10)  # Default to 10 if not set
    
    return stock_items

@frappe.whitelist()
def get_warehouses_for_cost_center(cost_center):
    """
    Get warehouses linked to a cost center from Healthcare Settings Nurse Mini Warehouse table.
    
    Returns list of warehouses defined in Healthcare Settings for the given cost center.
    This ensures only approved warehouses for the cost center can be used.
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Get warehouses from Healthcare Settings
    warehouses = get_cc_warehouses(cost_center)
    
    if not warehouses:
        frappe.msgprint(_("No warehouses configured for cost center {0} in Healthcare Settings").format(cost_center))
        return []
    
    return warehouses

@frappe.whitelist()
def get_inventory_items(search=None):
    """
    Get inventory items for dropdown/search
    """
    filters = {"disabled": 0}
    if search:
        filters["item_code"] = ["like", f"%{search}%"]
    
    items = frappe.get_all("Item", 
        filters=filters,
        fields=["item_code as code", "item_name as name", "stock_uom as uom", "valuation_rate as price"],
        limit=50
    )
    
    # If no results by item_code, try by item_name
    if search and len(items) == 0:
        items = frappe.get_all("Item",
            filters={"disabled": 0, "item_name": ["like", f"%{search}%"]},
            fields=["item_code as code", "item_name as name", "stock_uom as uom", "valuation_rate as price"],
            limit=50
        )
    
    return items

@frappe.whitelist()
def get_item_groups(search=None):
    """
    Get item groups for dropdown selection.
    Returns only leaf item groups (not parent groups).
    
    Args:
        search: Optional search term to filter item groups
        
    Returns:
        List of item groups with name and label
    """
    filters = {"is_group": 0}  # Only leaf groups, not parent groups
    
    if search:
        filters["name"] = ["like", f"%{search}%"]
    
    item_groups = frappe.get_all("Item Group",
        filters=filters,
        fields=["name", "item_group_name as label"],
        order_by="item_group_name",
        limit=100
    )
    
    return item_groups

@frappe.whitelist()
def get_default_warehouse_and_cost_center():
    """
    Get the default warehouse and cost center for the current user from Healthcare Settings.
    
    Returns:
        dict: {
            "warehouse": warehouse_name,
            "cost_center": cost_center_name,
            "can_change_warehouse": bool (True only for admin/system manager)
        }
    """
    user = frappe.session.user
    
    try:
        # Get user's permitted cost centers
        from healthcare.api.common import get_permitted_cost_centers
        permitted_cc = get_permitted_cost_centers()
        
        # Get the first permitted cost center if any
        cost_center = None
        if permitted_cc is None:
            # User is exempt (admin/system manager) - no restriction
            # Try to get from their employee record or return empty
            employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
            if employee:
                cost_center = frappe.db.get_value("Employee", employee, "cost_center")
        elif permitted_cc:
            cost_center = permitted_cc[0]
        
        warehouse = None
        if cost_center:
            warehouse = get_warehouse_for_cost_center(cost_center)
        
        can_change = _user_is_exempt(user)
        
        return {
            "warehouse": warehouse or "",
            "cost_center": cost_center or "",
            "can_change_warehouse": can_change
        }
    except Exception as e:
        frappe.log_error(f"Error getting default warehouse and cost center: {str(e)}")
        return {
            "warehouse": "",
            "cost_center": "",
            "can_change_warehouse": False
        }


@frappe.whitelist()
def create_material_request():
    """
    Create a Material Request document.
    
    Warehouse is automatically set from Healthcare Settings based on cost_center.
    Only Administrators and System Managers can override the warehouse.
    
    Expects POST data with the following structure:
    {
        "cost_center": "Cost Center Name",
        "warehouse": "Warehouse Name (optional - only for admin/system manager)",
        "request_date": "2024-01-01",
        "items": [
            {
                "item_code": "ITEM001",
                "item_name": "Item Name",
                "quantity": 10,
                "uom": "Unit",
                "notes": "Optional notes"
            }
        ],
        "requested_by": "User Name",
        "notes": "General notes"
    }
    """
    try:
        data = frappe.local.form_dict
        if not data:
            data = json.loads(frappe.request.data)
        
        cost_center = data.get("cost_center")
        user_provided_warehouse = data.get("warehouse")
        
        if not cost_center:
            frappe.throw(_("Cost Center is required"))
        
        # Get warehouse from Healthcare Settings
        warehouse = get_warehouse_for_cost_center(cost_center)
        
        # If user is trying to override warehouse, validate permission
        if user_provided_warehouse and user_provided_warehouse != warehouse:
            validate_warehouse_change_permission()
            warehouse = user_provided_warehouse
        
        if not warehouse:
            frappe.throw(_("No warehouse found for cost center {0} in Healthcare Settings").format(cost_center))
        
        # Create Material Request
        mr = frappe.get_doc({
            "doctype": "Material Request",
            "material_request_type": "Material Transfer",
            "transaction_date": data.get("request_date", today()),
            "schedule_date": data.get("request_date", today()),
            "cost_center": cost_center,
            "set_warehouse": warehouse,
            "custom_notes": data.get("notes", ""),
            "items": []
        })
        
        # Add items
        for item in data.get("items", []):
            if item.get("item_code") and item.get("quantity", 0) > 0:
                mr.append("items", {
                    "item_code": item.get("item_code"),
                    "item_name": item.get("item_name"),
                    "qty": item.get("quantity"),
                    "uom": item.get("uom"),
                    "description": item.get("notes", "")
                })
        
        if not mr.items:
            frappe.throw(_("At least one item is required"))
        
        mr.insert()
        mr.submit()
        
        # Update status to Submitted
        frappe.db.set_value("Material Request", mr.name, "status", "Submitted")
        frappe.db.commit()
        
        return {"name": mr.name}
        
    except Exception as e:
        frappe.throw(str(e))
        frappe.log_error(f"Error creating material request: {str(e)}")

@frappe.whitelist()
def get_material_requests(cost_center, status=None):
    """
    Get material requests for a cost center
    """
    print(f"Fetching material requests for cost center: {cost_center} with status: {status}")
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
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
def create_stock_reconciliation():
    """
    Create standard ERPNext Stock Reconciliation document.
    
    Warehouse is automatically set from Healthcare Settings based on cost_center.
    Only Administrators and System Managers can override the warehouse.
    
    Expects POST data:
    {
        "cost_center": "Cost Center Name",
        "warehouse": "Warehouse Name (optional - only for admin/system manager)",
        "reconciliation_date": "2024-01-01",
        "items": [
            {
                "item_code": "ITEM001",
                "qty": 15,
                "current_qty": 10
            }
        ],
        "reconciled_by": "User Name"
    }
    """
    try:
        data = frappe.local.form_dict
        if not data:
            data = json.loads(frappe.request.data)
        
        # Debug log
        frappe.logger().info(f"Stock Reconciliation Request Data: {json.dumps(data)}")
        
        cost_center = data.get("cost_center")
        user_provided_warehouse = data.get("warehouse")
        
        if not cost_center:
            frappe.throw(_("Cost Center is required"))
        
        # Get warehouse from Healthcare Settings
        warehouse = get_warehouse_for_cost_center(cost_center)
        
        # If user is trying to override warehouse, validate permission
        if user_provided_warehouse and user_provided_warehouse != warehouse:
            validate_warehouse_change_permission()
            warehouse = user_provided_warehouse
        
        if not warehouse:
            frappe.throw(_("No warehouse found for cost center {0} in Healthcare Settings").format(cost_center))
        
        # Get expense account for the company
        company = frappe.db.get_value("Warehouse", warehouse, "company")
        expense_account = frappe.db.get_value("Company", company, "default_expense_account")
        
        if not expense_account:
            expense_account = "Stock Adjustment - W"  # Default fallback
        
        # Create Stock Reconciliation
        sr = frappe.get_doc({
            "doctype": "Stock Reconciliation",
            "purpose": "Stock Reconciliation",
            "posting_date": data.get("reconciliation_date", today()),
            "cost_center": cost_center,
            "expense_account": expense_account,
            "items": []
        })
        
        # Add items with adjustments
        frappe.logger().info(f"Processing {len(data.get('items', []))} items for reconciliation")
        
        for idx, item in enumerate(data.get("items", [])):
            item_code = item.get("item_code")
            
            # Get quantity values - handle field name variations from frontend
            # Frontend sends: physical_quantity, physical_qty, qty, new_qty
            physical_qty = (
                item.get("physical_quantity") or 
                item.get("physical_qty") or 
                item.get("qty") or 
                item.get("new_qty") or
                None
            )
            
            # Get system quantity - handle field name variations from frontend  
            # Frontend sends: system_quantity, system_qty, current_qty, old_qty
            system_qty = (
                item.get("system_quantity") or
                item.get("system_qty") or
                item.get("current_qty") or
                item.get("old_qty") or
                0
            )
            
            frappe.logger().info(
                f"Item {idx}: code={item_code}, physical_qty={physical_qty}, "
                f"system_qty={system_qty}, difference={physical_qty - system_qty if physical_qty is not None else 'N/A'}"
            )
            
            # Only add if there's a difference and item_code is provided
            if item_code and physical_qty is not None and physical_qty != system_qty:
                frappe.logger().info(f"Adding item {item_code} with difference: {physical_qty - system_qty}")
                item_data = {
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "qty": physical_qty,
                    "current_qty": system_qty,
                }
                if item.get("serial_no"):
                    item_data["serial_no"] = item.get("serial_no")
                if item.get("batch_no"):
                    item_data["batch_no"] = item.get("batch_no")
                sr.append("items", item_data)
        
        frappe.logger().info(f"Stock Reconciliation has {len(sr.items)} items with differences")
        
        if not sr.items:
            frappe.logger().warn("No items with differences found")
            frappe.throw(_("No items with quantity differences found"))
        
        sr.insert()
        sr.submit()
        frappe.db.commit()
        
        frappe.response["message"] = {"name": sr.name}
        frappe.response["http_status_code"] = 200
        
    except Exception as e:
        frappe.response["message"] = str(e)
        frappe.response["http_status_code"] = 400
        frappe.log_error(f"Error creating stock reconciliation: {str(e)}")

@frappe.whitelist()
def get_stock_reconciliations(cost_center):
    """
    Get stock reconciliations for a cost center
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    reconciliations = frappe.get_all("Stock Reconciliation",
        filters={"cost_center": cost_center, "docstatus": 1},
        fields=["name", "posting_date", "owner", "warehouse", "purpose"],
        order_by="creation desc",
        limit=50
    )
    
    for rec in reconciliations:
        rec["items"] = frappe.get_all("Stock Reconciliation Item",
            filters={"parent": rec["name"]},
            fields=["item_code", "item_name", "qty", "current_qty", "current_quantity", "warehouse"]
        )
    
    frappe.response["message"] = reconciliations

@frappe.whitelist()
def create_material_receipt():
    """
    Create Purchase Receipt for materials.
    
    Warehouse is automatically set from Healthcare Settings based on cost_center.
    Only Administrators and System Managers can override the warehouse.
    
    Expects POST data:
    {
        "cost_center": "Cost Center Name",
        "warehouse": "Warehouse Name (optional - only for admin/system manager)",
        "receipt_date": "2024-01-01",
        "supplier": "Supplier Name",
        "invoice_number": "INV-001",
        "items": [
            {
                "item_code": "ITEM001",
                "item_name": "Item Name",
                "quantity": 10,
                "unit_price": 100,
                "total_price": 1000,
                "batch_number": "BATCH001",
                "expiry_date": "2025-12-31"
            }
        ],
        "total_amount": 1000,
        "received_by": "User Name"
    }
    """
    try:
        data = frappe.local.form_dict
        if not data:
            data = json.loads(frappe.request.data)
        
        cost_center = data.get("cost_center")
        user_provided_warehouse = data.get("warehouse")
        
        if not cost_center:
            frappe.throw(_("Cost Center is required"))
        
        # Get warehouse from Healthcare Settings
        warehouse = get_warehouse_for_cost_center(cost_center)
        
        # If user is trying to override warehouse, validate permission
        if user_provided_warehouse and user_provided_warehouse != warehouse:
            validate_warehouse_change_permission()
            warehouse = user_provided_warehouse
        
        if not warehouse:
            frappe.throw(_("No warehouse found for cost center {0} in Healthcare Settings").format(cost_center))
        
        # Get default supplier if not provided
        supplier = data.get("supplier")
        if not supplier:
            supplier = frappe.db.get_value("Supplier", {"supplier_name": "Local Purchase"}, "name")
            if not supplier:
                # Create a default supplier if none exists
                supplier = frappe.get_doc({
                    "doctype": "Supplier",
                    "supplier_name": "Local Purchase",
                    "supplier_group": "Local",
                    "supplier_type": "Individual"
                }).insert().name
        
        # Get company
        company = frappe.db.get_value("Warehouse", warehouse, "company")
        
        # Create Purchase Receipt
        pr = frappe.get_doc({
            "doctype": "Purchase Receipt",
            "posting_date": data.get("receipt_date", today()),
            "supplier": supplier,
            "bill_no": data.get("invoice_number"),
            "set_warehouse": warehouse,
            "company": company,
            "cost_center": cost_center,
            "items": []
        })
        
        total_amount = 0
        for item in data.get("items", []):
            if item.get("item_code") and item.get("quantity", 0) > 0:
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
        
        if not pr.items:
            frappe.throw(_("At least one item is required"))
        
        pr.total = total_amount
        pr.grand_total = total_amount
        pr.insert()
        pr.submit()
        frappe.db.commit()
        
        frappe.response["message"] = {"name": pr.name}
        frappe.response["http_status_code"] = 200
        
    except Exception as e:
        frappe.response["message"] = str(e)
        frappe.response["http_status_code"] = 400
        frappe.log_error(f"Error creating material receipt: {str(e)}")

@frappe.whitelist()
def get_material_receipts(cost_center):
    """
    Get material receipts for a cost center.
    
    Uses warehouse from Healthcare Settings based on cost_center.
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Get warehouse from Healthcare Settings
    warehouse = get_warehouse_for_cost_center(cost_center)
    
    if not warehouse:
        frappe.response["message"] = []
        return
    
    receipts = frappe.get_all("Purchase Receipt",
        filters={"set_warehouse": warehouse, "docstatus": 1},
        fields=["name", "posting_date as receipt_date", "supplier", "bill_no as invoice_number", 
                "grand_total as total_amount", "owner as received_by", "status"],
        order_by="creation desc",
        limit=50
    )
    
    for receipt in receipts:
        receipt["items"] = frappe.get_all("Purchase Receipt Item",
            filters={"parent": receipt["name"]},
            fields=["item_code", "item_name", "qty as quantity", "rate as unit_price", 
                    "amount as total_price", "batch_no as batch_number", "expiry_date"]
        )
    
    frappe.response["message"] = receipts

@frappe.whitelist()
def get_user_cost_centers():
    """
    Get cost centers assigned to the current user
    """
    user = frappe.session.user
    
    # Get cost centers from user permissions
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
            employee_cost_center = frappe.db.get_value("Employee", employee, "cost_center")
            if employee_cost_center:
                cost_centers = [{
                    "name": employee_cost_center,
                    "label": frappe.db.get_value("Cost Center", employee_cost_center, "cost_center_name")
                }]
    
    # If still no cost centers, return some default ones for testing
    if not cost_centers:
        cost_centers = frappe.get_all("Cost Center", 
            filters={"is_group": 0},
            fields=["name", "cost_center_name as label"], 
            limit=10)
    
    frappe.response["message"] = cost_centers
    
# Add to healthcare/api/nursing_inventory.py

@frappe.whitelist()
def get_all_cost_centers():
    """
    Get all cost centers for users with full access (System Manager, Administrator)
    """
    user = frappe.session.user
    
    # Check if user has full access
    user_roles = frappe.get_roles(user)
    full_access_roles = ['System Manager', 'Administrator', 'Accounts Manager', 'Stock Manager']
    
    has_full_access = any(role in full_access_roles for role in user_roles)
    
    if has_full_access:
        # Return all active cost centers
        cost_centers = frappe.get_all("Cost Center",
            filters={"is_group": 0, "disabled": 0},
            fields=["name", "cost_center_name as label"],
            limit=100
        )
    else:
        # Return only cost centers the user has permission to
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
            LIMIT 100
        """, (user, user), as_dict=1)
    
    frappe.response["message"] = cost_centers