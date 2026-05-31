

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
            "company": company linked to the resolved cost_center (ERPNext Cost Center.company), or "",
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

        patient_care_type = ""
        company_from_cc = ""
        if cost_center:
            try:
                cc_meta = frappe.get_meta("Cost Center")
                cc_fields = ["company"]
                if cc_meta.has_field("custom_patient_care_type"):
                    cc_fields.append("custom_patient_care_type")
                rows = frappe.get_all(
                    "Cost Center",
                    filters={"name": cost_center},
                    fields=cc_fields,
                    limit=1,
                    ignore_permissions=True,
                )
                r0 = rows[0] if rows else {}
                if cc_meta.has_field("custom_patient_care_type"):
                    patient_care_type = ((r0.get("custom_patient_care_type") or "") or "").strip()
                company_from_cc = ((r0.get("company") or "") or "").strip()
            except Exception:
                patient_care_type = ""
                company_from_cc = ""
        return {
            "warehouse": warehouse or "",
            "cost_center": cost_center or "",
            "can_change_warehouse": can_change,
            "cost_center_patient_care_type": patient_care_type,
            "company": company_from_cc or "",
        }
    except Exception as e:
        frappe.log_error(f"Error getting default warehouse and cost center: {str(e)}")
        return {
            "warehouse": "",
            "cost_center": "",
            "can_change_warehouse": False,
            "cost_center_patient_care_type": "",
            "company": "",
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

# @frappe.whitelist()
# def create_stock_reconciliation():
#     """
#     Create standard ERPNext Stock Reconciliation document.
    
#     Warehouse is automatically set from Healthcare Settings based on cost_center.
#     Only Administrators and System Managers can override the warehouse.
    
#     Expects POST data:
#     {
#         "cost_center": "Cost Center Name",
#         "warehouse": "Warehouse Name (optional - only for admin/system manager)",
#         "reconciliation_date": "2024-01-01",
#         "items": [
#             {
#                 "item_code": "ITEM001",
#                 "qty": 15,
#                 "current_qty": 10
#             }
#         ],
#         "reconciled_by": "User Name"
#     }
#     """
#     try:
#         data = frappe.local.form_dict
#         if not data:
#             data = json.loads(frappe.request.data)
        
#         # Debug log
#         frappe.logger().info(f"Stock Reconciliation Request Data: {json.dumps(data)}")
        
#         cost_center = data.get("cost_center")
#         user_provided_warehouse = data.get("warehouse")
        
#         if not cost_center:
#             frappe.throw(_("Cost Center is required"))
        
#         # Get warehouse from Healthcare Settings
#         warehouse = get_warehouse_for_cost_center(cost_center)
        
#         # If user is trying to override warehouse, validate permission
#         if user_provided_warehouse and user_provided_warehouse != warehouse:
#             validate_warehouse_change_permission()
#             warehouse = user_provided_warehouse
        
#         if not warehouse:
#             frappe.throw(_("No warehouse found for cost center {0} in Healthcare Settings").format(cost_center))
        
#         # Get expense account for the company
#         company = frappe.db.get_value("Warehouse", warehouse, "company")
#         expense_account = frappe.db.get_value("Company", company, "default_expense_account")
        
#         if not expense_account:
#             expense_account = "Stock Adjustment - W"  # Default fallback
        
#         # Create Stock Reconciliation
#         sr = frappe.get_doc({
#             "doctype": "Stock Reconciliation",
#             "purpose": "Stock Reconciliation",
#             "posting_date": data.get("reconciliation_date", today()),
#             "cost_center": cost_center,
#             "expense_account": expense_account,
#             "items": []
#         })
        
#         # Add items with adjustments
#         frappe.logger().info(f"Processing {len(data.get('items', []))} items for reconciliation")
        
#         for idx, item in enumerate(data.get("items", [])):
#             item_code = item.get("item_code")
            
#             # Get quantity values - handle field name variations from frontend
#             # Frontend sends: physical_quantity, physical_qty, qty, new_qty
#             physical_qty = (
#                 item.get("physical_quantity") or 
#                 item.get("physical_qty") or 
#                 item.get("qty") or 
#                 item.get("new_qty") or
#                 None
#             )
            
#             # Get system quantity - handle field name variations from frontend  
#             # Frontend sends: system_quantity, system_qty, current_qty, old_qty
#             system_qty = (
#                 item.get("system_quantity") or
#                 item.get("system_qty") or
#                 item.get("current_qty") or
#                 item.get("old_qty") or
#                 0
#             )
            
#             frappe.logger().info(
#                 f"Item {idx}: code={item_code}, physical_qty={physical_qty}, "
#                 f"system_qty={system_qty}, difference={physical_qty - system_qty if physical_qty is not None else 'N/A'}"
#             )
            
#             # Only add if there's a difference and item_code is provided
#             if item_code and physical_qty is not None and physical_qty != system_qty:
#                 frappe.logger().info(f"Adding item {item_code} with difference: {physical_qty - system_qty}")
#                 item_data = {
#                     "item_code": item_code,
#                     "warehouse": warehouse,
#                     "qty": physical_qty,
#                     "current_qty": system_qty,
#                 }
#                 if item.get("serial_no"):
#                     item_data["serial_no"] = item.get("serial_no")
#                 if item.get("batch_no"):
#                     item_data["batch_no"] = item.get("batch_no")
#                 sr.append("items", item_data)
        
#         frappe.logger().info(f"Stock Reconciliation has {len(sr.items)} items with differences")
        
#         if not sr.items:
#             frappe.logger().warn("No items with differences found")
#             frappe.throw(_("No items with quantity differences found"))
        
#         sr.insert()
#         sr.submit()
#         frappe.db.commit()
        
#         frappe.response["message"] = {"name": sr.name}
#         frappe.response["http_status_code"] = 200
        
#     except Exception as e:
#         frappe.response["message"] = str(e)
#         frappe.response["http_status_code"] = 400
#         frappe.log_error(f"Error creating stock reconciliation: {str(e)}")


@frappe.whitelist()
def create_stock_reconciliation():
    """
    Create standard ERPNext Stock Reconciliation document.
    
    Handles serialized and batched items properly.
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
        
        frappe.logger().info(f"Processing {len(data.get('items', []))} items for reconciliation")
        
        for idx, item in enumerate(data.get("items", [])):
            item_code = item.get("item_code")
            
            # Get quantity values
            physical_qty = (
                item.get("physical_quantity") or 
                item.get("physical_qty") or 
                item.get("qty") or 
                item.get("new_qty") or
                None
            )
            
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
                
                # Get item details to check if it's serialized or batched
                item_details = frappe.get_cached_value("Item", item_code, 
                    ["has_serial_no", "has_batch_no", "stock_uom"], as_dict=1)
                
                item_data = {
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "qty": physical_qty,
                    "current_qty": system_qty,
                    "current_qty_as_per_serial_no": system_qty,  # Important for serial items
                }
                
                # Handle serial/batch bundles for items with tracking
                bundle_name = None
                if (item_details and (item_details.has_serial_no or item_details.has_batch_no)) and physical_qty > 0:
                    # Create Serial and Batch Bundle for new stock
                    serial_nos = item.get("serial_nos") or item.get("serial_no") or []
                    batch_no = item.get("batch_no")
                    
                    if isinstance(serial_nos, str):
                        serial_nos = [s.strip() for s in serial_nos.split(',')]
                    
                    # Create bundle document
                    bundle = frappe.get_doc({
                        "doctype": "Serial and Batch Bundle",
                        "item_code": item_code,
                        "warehouse": warehouse,
                        "bundle_type": "Inward",  # Always Inward for reconciliation adding stock
                        "entries": []
                    })
                    
                    # Add serial/batch entries
                    if item_details.has_serial_no and serial_nos:
                        for serial_no in serial_nos:
                            bundle.append("entries", {
                                "serial_no": serial_no,
                                "batch_no": batch_no if item_details.has_batch_no else None,
                                "qty": 1
                            })
                    elif item_details.has_batch_no and batch_no:
                        # Batch only item
                        bundle.append("entries", {
                            "batch_no": batch_no,
                            "qty": physical_qty
                        })
                    
                    if bundle.entries:
                        bundle.insert()
                        bundle_name = bundle.name
                        item_data["serial_and_batch_bundle"] = bundle_name
                        frappe.logger().info(f"Created Serial and Batch Bundle {bundle_name} for item {item_code}")
                
                # For decreasing stock with existing serials, specify serial_no directly
                elif item_details and item_details.has_serial_no and physical_qty < system_qty:
                    serial_nos = item.get("serial_nos") or item.get("serial_no")
                    if serial_nos:
                        if isinstance(serial_nos, list):
                            serial_nos = ", ".join(serial_nos)
                        item_data["serial_no"] = serial_nos
                
                # Handle batch for decreasing stock
                if item_details and item_details.has_batch_no and physical_qty < system_qty:
                    batch_no = item.get("batch_no")
                    if batch_no:
                        item_data["batch_no"] = batch_no
                
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
    print(f"Fetching stock reconciliations for cost center: {cost_center}")
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Try to get all reconciliations first to see if any exist
    all_reconciliations = frappe.get_all("Stock Reconciliation",
        fields=["name", "posting_date", "owner", "purpose", "cost_center", "docstatus"],
        order_by="creation desc",
        limit=10
    )
    print(f"All stock reconciliations in system: {len(all_reconciliations)}")
    for rec in all_reconciliations[:3]:  # Show first 3
        print(f"  - {rec.name}: cost_center={rec.cost_center}, docstatus={rec.docstatus}")
    
    reconciliations = frappe.get_all("Stock Reconciliation",
        filters={"cost_center": cost_center},
        fields=["name", "posting_date", "owner", "purpose", "docstatus"],
        order_by="creation desc",
        limit=50
    )
    print(f"Stock reconciliations for cost center {cost_center}: {len(reconciliations)}")
    
    for rec in reconciliations:
        rec["items"] = frappe.get_all("Stock Reconciliation Item",
            filters={"parent": rec["name"]},
            fields=["item_code", "item_name", "qty", "current_qty", "warehouse"]
        )
    
    frappe.response["message"] = reconciliations

@frappe.whitelist()
def get_item_batches(item_code, warehouse):
    """
    Returns a list of dicts with batch numbers and their actual quantities
    for a given item code and warehouse.
    """
    if not item_code or not warehouse:
        return []

    # Get all batches for the item
    batches = frappe.get_all("Batch", 
        filters={"item": item_code}, 
        fields=["batch_id", "expiry_date", "manufacturing_date"]
    )

    batch_qty_data = []
    for batch in batches:
        qty = get_batch_qty(batch_no=batch.batch_id, warehouse=warehouse)
        if qty > 0:
            batch_qty_data.append({
                "batch_id": batch.batch_id, 
                "qty": qty,
                "expiry_date": batch.expiry_date,
                "manufacturing_date": batch.manufacturing_date
            })

    return batch_qty_data

@frappe.whitelist()
def get_item_batches(item_code, warehouse):
    """
    Returns a list of dicts with batch numbers and their actual quantities
    for a given item code and warehouse.
    """
    if not item_code or not warehouse:
        return []
    
    print(f"Getting batches for item: {item_code}, warehouse: {warehouse}")
    
    # Get all batches for the item
    batches = frappe.get_all("Batch", 
        filters={"item": item_code}, 
        fields=["name", "batch_id", "expiry_date", "manufacturing_date", "batch_qty"]
    )
    
    print(f"Found {len(batches)} batches for item {item_code}")
    
    batch_qty_data = []
    for batch in batches:
        # Get quantity from Serial and Batch Bundle
        bundle_qty = get_batch_quantity_from_bundles(batch.name, warehouse)
        
        # If no bundle quantity, use batch_qty
        qty = bundle_qty if bundle_qty > 0 else (batch.batch_qty if batch.batch_qty else 0)
        
        print(f"Batch {batch.name}: bundle_qty = {bundle_qty}, batch_qty = {batch.batch_qty}, final qty = {qty}")
        
        if qty > 0:
            batch_qty_data.append({
                "batch_id": batch.batch_id,
                "batch_name": batch.name,
                "qty": qty,
                "expiry_date": batch.expiry_date,
                "manufacturing_date": batch.manufacturing_date
            })
    
    return batch_qty_data

@frappe.whitelist()
def get_batch_quantity_from_bundles(batch_no, warehouse):
    """
    Get total quantity for a batch from Serial and Batch Bundles
    """
    if not batch_no or not warehouse:
        return 0
    
    # Query Serial and Batch Bundle to get total quantity
    result = frappe.db.sql("""
        SELECT 
            SUM(sabb.total_qty) as total_qty
        FROM `tabSerial and Batch Bundle` sabb
        INNER JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sabb.name
        WHERE sbe.batch_no = %s 
            AND sabb.warehouse = %s
            AND sabb.docstatus = 1
            AND sabb.is_cancelled = 0
    """, (batch_no, warehouse), as_dict=1)
    
    if result and result[0].get('total_qty') and result[0]['total_qty'] is not None:
        return abs(result[0]['total_qty'])
    
    return 0

@frappe.whitelist()
def get_item_serials(item_code, warehouse):
    """
    Returns a list of available Serial Nos for a given item and warehouse.
    Gets serials from Serial and Batch Bundle entries.
    """
    if not item_code or not warehouse:
        return []
    
    print(f"Getting serials for item: {item_code}, warehouse: {warehouse}")
    
    # Get serials from Serial and Batch Bundle entries
    result = frappe.db.sql("""
        SELECT DISTINCT
            sbe.serial_no
        FROM `tabSerial and Batch Bundle` sabb
        INNER JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sabb.name
        WHERE sbe.item_code = %s 
            AND sabb.warehouse = %s
            AND sabb.docstatus = 1
            AND sabb.is_cancelled = 0
            AND sbe.serial_no IS NOT NULL
            AND sbe.serial_no != ''
        ORDER BY sabb.modified DESC
        LIMIT 500
    """, (item_code, warehouse), as_dict=1)
    
    serials = []
    for row in result:
        if row.serial_no:
            serials.append(row.serial_no)
    
    print(f"Found {len(serials)} serials for item {item_code}")
    return serials

@frappe.whitelist()
def get_batch_details_with_serials(batch_no, warehouse):
    """
    Get all serial numbers for a specific batch in a warehouse
    """
    if not batch_no or not warehouse:
        return []
    
    # Get all serials for this batch from bundles
    result = frappe.db.sql("""
        SELECT 
            sbe.serial_no,
            sbe.qty,
            sabb.name as bundle_name,
            sabb.voucher_type,
            sabb.voucher_no
        FROM `tabSerial and Batch Bundle` sabb
        INNER JOIN `tabSerial and Batch Entry` sbe ON sbe.parent = sabb.name
        WHERE sbe.batch_no = %s 
            AND sabb.warehouse = %s
            AND sabb.docstatus = 1
            AND sabb.is_cancelled = 0
            AND sbe.serial_no IS NOT NULL
            AND sbe.serial_no != ''
        ORDER BY sabb.modified DESC
    """, (batch_no, warehouse), as_dict=1)
    
    return result
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
    Get material transfers (Stock Entries) for a cost center.
    
    Shows stock entries of material transfer that have been transferred to the nurse's warehouse.
    Uses warehouse from Healthcare Settings based on cost_center.
    """
    if not cost_center:
        frappe.throw(_("Cost Center is required"))
    
    # Get warehouse from Healthcare Settings (nurse's warehouse)
    warehouse = get_warehouse_for_cost_center(cost_center)
    
    if not warehouse:
        frappe.response["message"] = []
        return
    # Get Stock Entries with purpose "Material Transfer" to the nurse's warehouse
    transfers = frappe.get_all("Stock Entry",
        filters={
            "purpose": "Material Transfer",
            "to_warehouse": warehouse,
            # "cost_center": cost_center,
            "docstatus": 1
        },
        fields=[
            "name", 
            "posting_date as transfer_date", 
            "from_warehouse", 
            "to_warehouse", 
            "total_outgoing_value as total_amount", 
            "owner as transferred_by", 
            "stock_entry_type"
        ],
        order_by="creation desc",
        limit=50
    )
    # frappe.throw("Uko wapi", str(transfers))
    for transfer in transfers:
        transfer["items"] = frappe.get_all("Stock Entry Detail",
            filters={"parent": transfer["name"]},
            fields=[
                "item_code", 
                "item_name", 
                "qty as quantity", 
                "basic_rate as unit_price", 
                "amount as total_price", 
                "batch_no as batch_number", 
                # "expiry_date"
            ]
        )
    
    frappe.response["message"] = transfers

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
    
def _aggregate_medicine_given_items(given_rows):
    """Sum qty per item code from unbilled Medicine Given child rows."""
    items = {}
    row_names = []
    for row in given_rows or []:
        row_name = (row.get("name") or "").strip()
        code = (row.get("medicine_code") or "").strip()
        qty = flt(row.get("qty"))
        if not code or qty <= 0:
            continue
        if row_name:
            row_names.append(row_name)
        if code not in items:
            items[code] = {
                "qty": 0,
                "name": (row.get("medicine_name") or code).strip() or code,
            }
        items[code]["qty"] += qty
    return items, row_names


def _group_medicine_given_for_billing(given_rows):
    """Group unbilled given rows by item + batch + dispensing lot for SO/DN lines."""
    groups = []
    index = {}
    for row in given_rows or []:
        code = (row.get("medicine_code") or "").strip()
        qty = flt(row.get("qty"))
        if not code or qty <= 0:
            continue
        batch_no = (row.get("batch_no") or "").strip()
        dispensing_lot = (row.get("dispensing_lot") or "").strip()
        lot_no = (row.get("lot_no") or "").strip()
        key = (code, batch_no, dispensing_lot, lot_no)
        if key not in index:
            index[key] = len(groups)
            groups.append(
                {
                    "medicine_code": code,
                    "medicine_name": (row.get("medicine_name") or code).strip() or code,
                    "qty": 0,
                    "batch_no": batch_no or None,
                    "dispensing_lot": dispensing_lot or None,
                    "lot_no": lot_no or None,
                    "row_names": [],
                }
            )
        group = groups[index[key]]
        group["qty"] += qty
        if row.get("name"):
            group["row_names"].append(row["name"])
    return groups


def _apply_medicine_tracking_to_delivery_note(dn, billing_groups):
    """Set batch_no and custom_dispensing_lot on Delivery Note items from given medicine groups."""
    if not dn or not billing_groups:
        return

    dn_item_meta = frappe.get_meta("Delivery Note Item")
    has_batch_field = dn_item_meta.has_field("batch_no")
    has_dispensing_field = dn_item_meta.has_field("custom_dispensing_lot")

    pending = {}
    for group in billing_groups:
        code = group.get("medicine_code")
        pending.setdefault(code, []).append(group)

    for dn_row in dn.get("items") or []:
        code = dn_row.item_code
        candidates = pending.get(code) or []
        if not candidates:
            continue
        group = candidates.pop(0)
        if has_batch_field and group.get("batch_no"):
            dn_row.batch_no = group["batch_no"]
        if has_dispensing_field and group.get("dispensing_lot"):
            dn_row.custom_dispensing_lot = group["dispensing_lot"]


def _validate_delivery_note_dispensing_lots(dn):
    """Validate dispensing lots on DN using beveren_health rules when installed."""
    try:
        from beveren_health.beveren_health.customize.dispensing_lot import validate_sales_invoice_dispensing_lots
    except ImportError:
        return
    validate_sales_invoice_dispensing_lots(dn)


def _process_delivery_note_dispensing_lots(dn):
    """Post dispensing lot Out transactions when DN is submitted (beveren_health)."""
    try:
        from beveren_health.beveren_health.customize.dispensing_lot import process_sales_invoice_dispensing_lots
    except ImportError:
        return
    process_sales_invoice_dispensing_lots(dn, is_return=False)


def _unbilled_medicine_given_filters(admission_detail_name, consumption_date):
    return {
        "parent": admission_detail_name,
        "parenttype": "Admission Detail",
        "date": getdate(consumption_date),
        "medicine_code": ["is", "set"],
        "sales_order": ["is", "not set"],
    }


def _link_medicine_given_to_billing(row_names, sales_order, delivery_note):
    """Stamp Sales Order / Delivery Note on Medicine Given child rows."""
    if not row_names:
        return 0
    values = {}
    if sales_order:
        values["sales_order"] = sales_order
    if delivery_note:
        values["delivery_note"] = delivery_note
    if not values:
        return 0
    for row_name in row_names:
        frappe.db.set_value("Medicine Given", row_name, values, update_modified=True)
    return len(row_names)


def _create_delivery_note_for_sales_order(sales_order_name, patient, posting_date=None, billing_groups=None):
    """Create and submit a Delivery Note from a submitted Sales Order to consume stock."""
    from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

    dn = make_delivery_note(sales_order_name)
    if not dn or not dn.get("items"):
        frappe.throw(
            _("Could not create Delivery Note from Sales Order {0}. Ensure the order has deliverable stock items.").format(
                sales_order_name
            )
        )

    if posting_date:
        dn.posting_date = getdate(posting_date)
        dn.set_posting_time = 0

    dn_meta = frappe.get_meta("Delivery Note")
    if patient and dn_meta.has_field("patient"):
        dn.patient = patient

    _apply_medicine_tracking_to_delivery_note(dn, billing_groups or [])
    _validate_delivery_note_dispensing_lots(dn)

    dn.insert(ignore_permissions=True)
    dn.submit()
    _process_delivery_note_dispensing_lots(dn)

    return dn


def _create_medicine_sales_order_for_admission(admission, consumption_date):
    """Create a draft Sales Order for medicine given on one admission for a date."""
    from healthcare.api.medicine_given import _get_or_create_admission_detail
    from healthcare.api.patient_medication_order import get_item_rate, get_item_tax, get_tax_account
    from healthcare.api.sales_order_cost_center import apply_cost_center_to_sales_order

    admission = (admission or "").strip()
    if not admission:
        frappe.throw(_("Admission is required"))

    if not frappe.db.exists("Inpatient Admission", admission):
        frappe.throw(_("Inpatient Admission {0} does not exist").format(admission))

    admission_doc = frappe.get_doc("Inpatient Admission", admission)
    cost_center = (getattr(admission_doc, "cost_center", None) or "").strip()
    if not cost_center:
        frappe.throw(
            _("Cost Center is not set on Inpatient Admission {0}. Please set it on the admission record.").format(
                admission
            )
        )

    company = admission_doc.company or frappe.defaults.get_user_default("Company")
    if not company:
        frappe.throw(_("Company is required on Inpatient Admission {0}").format(admission))

    patient = admission_doc.patient
    if not patient:
        frappe.throw(_("Patient is required on Inpatient Admission {0}").format(admission))

    customer = frappe.db.get_value("Patient", patient, "customer")
    if not customer:
        frappe.throw(
            _("Patient {0} has no Customer linked. Link a customer on the patient record first.").format(patient)
        )

    admission_detail = _get_or_create_admission_detail(admission)
    given_rows = frappe.get_all(
        "Medicine Given",
        filters=_unbilled_medicine_given_filters(admission_detail.name, consumption_date),
        fields=["name", "medicine_code", "medicine_name", "qty", "batch_no", "lot_no", "dispensing_lot"],
    )
    billing_groups = _group_medicine_given_for_billing(given_rows)
    if not billing_groups:
        frappe.throw(
            _("No unbilled medicine given records found for admission {0} on {1}. Rows may already be linked to a Sales Order.").format(
                admission, getdate(consumption_date)
            )
        )
    linked_row_names = []
    for group in billing_groups:
        linked_row_names.extend(group.get("row_names") or [])

    warehouse = get_warehouse_for_cost_center(cost_center)
    if not warehouse:
        frappe.throw(
            _("No warehouse configured for cost center {0} in Healthcare Settings. Configure Nurse Mini Warehouse before billing given medicine.").format(
                cost_center
            )
        )

    so = frappe.new_doc("Sales Order")
    so.company = company
    so.patient = patient
    so.customer = customer
    so.transaction_date = getdate(consumption_date)
    so.delivery_date = getdate(consumption_date)

    if hasattr(so, "custom_patient_name") and admission_doc.patient_name:
        so.custom_patient_name = admission_doc.patient_name
    if hasattr(so, "custom_patient"):
        so.custom_patient = patient

    so.custom_reference_type = "Inpatient Admission"
    so.custom_reference_name = admission
    so.custom_base_reference = "Admission Detail"
    so.custom_base_reference_name = admission_detail.name

    if warehouse and hasattr(so, "set_warehouse"):
        so.set_warehouse = warehouse

    so_item_meta = frappe.get_meta("Sales Order Item")
    tax_templates_added = set()
    for group in billing_groups:
        item_code = group["medicine_code"]
        item_row = {
            "item_code": item_code,
            "qty": group["qty"],
            "description": group["medicine_name"],
        }
        rate = flt(get_item_rate(item_code))
        if rate:
            item_row["rate"] = rate
            item_row["price_list_rate"] = rate
        if warehouse:
            item_row["warehouse"] = warehouse
        if group.get("batch_no") and so_item_meta.has_field("batch_no"):
            item_row["batch_no"] = group["batch_no"]
        so.append("items", item_row)

        tax_info = get_item_tax(item_code, company)
        tax_template = tax_info.get("tax_template")
        if tax_template and tax_template not in tax_templates_added:
            tax_account = get_tax_account(tax_template)
            if tax_account:
                so.append(
                    "taxes",
                    {
                        "charge_type": "On Net Total",
                        "account_head": tax_account,
                        "description": f"Tax: {tax_template}",
                        "rate": tax_info.get("tax_rate", 0),
                        "included_in_print_rate": 0,
                        "included_in_paid_amount": 0,
                    },
                )
                tax_templates_added.add(tax_template)

    apply_cost_center_to_sales_order(so, cost_center)
    so.insert(ignore_permissions=True)
    so.submit()

    dn = _create_delivery_note_for_sales_order(so.name, patient, consumption_date, billing_groups)
    linked_count = _link_medicine_given_to_billing(linked_row_names, so.name, dn.name)

    return {
        "sales_order": so.name,
        "status": so.status,
        "delivery_note": dn.name,
        "delivery_note_status": dn.status,
        "cost_center": cost_center,
        "admission": admission,
        "linked_rows": linked_count,
    }


@frappe.whitelist()
def create_daily_medicine_sales_order(admission=None, cost_center=None, consumption_date=None):
    """Create a draft Sales Order for medicine given on an inpatient admission.

    Cost center is taken from the linked Inpatient Admission (via Admission Detail),
    not from the current user's permissions.
    """
    admission = (admission or "").strip() or None
    consumption_date = getdate(consumption_date or today())

    if admission:
        result = _create_medicine_sales_order_for_admission(admission, consumption_date)
        frappe.db.commit()
        return result

    cost_center = (cost_center or "").strip() or None
    if not cost_center:
        frappe.throw(_("Admission or Cost Center is required"))

    admissions = frappe.db.sql(
        """
        SELECT DISTINCT ad.admission
        FROM `tabMedicine Given` mg
        INNER JOIN `tabAdmission Detail` ad ON ad.name = mg.parent
        INNER JOIN `tabInpatient Admission` ia ON ia.name = ad.admission
        WHERE mg.date = %s
          AND ia.cost_center = %s
          AND mg.medicine_code IS NOT NULL
          AND (mg.sales_order IS NULL OR mg.sales_order = '')
        """,
        (consumption_date, cost_center),
        as_dict=True,
    )
    if not admissions:
        frappe.throw(
            _("No unbilled medicine given records found for cost center {0} on {1}").format(
                cost_center, consumption_date
            )
        )

    created = []
    for row in admissions:
        created.append(_create_medicine_sales_order_for_admission(row.admission, consumption_date))

    frappe.db.commit()
    first = created[0]
    return {
        "sales_order": first["sales_order"],
        "status": first["status"],
        "cost_center": cost_center,
        "created_count": len(created),
        "sales_orders": [c["sales_order"] for c in created],
    }


@frappe.whitelist()
def create_daily_medicine_sales_orders():
    """
    Scheduled job to create daily sales orders for medicine consumption.
    Runs daily at midnight to create sales orders for the previous day's medicine consumption.
    """
    from frappe.utils import add_days, today

    yesterday = add_days(today(), -1)

    admissions_with_consumption = frappe.db.sql(
        """
        SELECT DISTINCT ad.admission, ia.cost_center
        FROM `tabMedicine Given` mg
        INNER JOIN `tabAdmission Detail` ad ON ad.name = mg.parent
        INNER JOIN `tabInpatient Admission` ia ON ia.name = ad.admission
        WHERE mg.date = %s
          AND ia.cost_center IS NOT NULL
          AND mg.medicine_code IS NOT NULL
          AND (mg.sales_order IS NULL OR mg.sales_order = '')
        """,
        (yesterday,),
        as_dict=True,
    )

    created_orders = []
    failed_orders = []

    for row in admissions_with_consumption:
        admission = row.admission
        try:
            result = _create_medicine_sales_order_for_admission(admission, yesterday)
            created_orders.append(result)
            frappe.logger().info(
                f"Created daily medicine sales order {result['sales_order']} for admission {admission}"
            )
        except Exception as e:
            failed_orders.append({"admission": admission, "error": str(e)})
            frappe.logger().error(
                f"Failed to create daily medicine sales order for admission {admission}: {str(e)}"
            )

    if created_orders:
        frappe.db.commit()

    if created_orders:
        frappe.logger().info(
            f"Daily medicine sales orders created: {len(created_orders)} orders"
        )

    if failed_orders:
        frappe.logger().error(f"Failed to create daily medicine sales orders for: {failed_orders}")

    return {
        "created": created_orders,
        "failed": failed_orders,
    }
    
@frappe.whitelist()
def get_all_cost_centers():
    """
    Get all cost centers for dropdowns
    """
    cost_centers = frappe.get_all("Cost Center", 
        filters={"is_group": 0},
        fields=["name", "cost_center_name as label"], 
        order_by="cost_center_name asc")
    return cost_centers