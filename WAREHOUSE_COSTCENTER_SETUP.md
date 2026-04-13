# Warehouse & Cost Center Integration Setup Guide

## Overview

This feature automatically assigns warehouses to cost centers through the Healthcare Settings "Nurse Mini Warehouse" configuration. This ensures:

- **Consistency**: All transactions for a cost center use the correct warehouse
- **Security**: Regular users cannot change warehouse assignments
- **Automation**: Warehouses are fetched automatically from settings

## Affected Operations

The following operations now automatically use warehouses from Healthcare Settings:

1. **Stock Ledger** - Shows stock for the warehouse assigned to a cost center
2. **Stock Reconciliation** - Auto-sets warehouse when creating reconciliations
3. **Material Receipt** - Auto-fills warehouse for receiving materials
4. **Material Request** - Auto-selects warehouse for material transfers

## Setup Instructions

### Step 1: Configure Healthcare Settings

1. Navigate to **Healthcare Settings**
2. Scroll to the **Stock** section
3. Find the **Nurse Mini Warehouse** table
4. For each cost center that needs a warehouse, add a row:
   - **Warehouse**: Select the warehouse for this cost center
   - **Cost Center**: Select the cost center that will use this warehouse

Example Configuration:
```
| Warehouse    | Cost Center           |
|--------------|----------------------|
| Main Store   | Nursing Department   |
| ICU Store    | ICU - Department     |
| Lab Storage  | Laboratory           |
```

### Step 2: Set User Cost Center Permissions

1. Navigate to **User Permissions**
2. For each user, set their allowed Cost Center
3. The system will automatically determine the warehouse from Healthcare Settings

## Permission Model

### Regular Users (Non-Admin)
- **Can**: View stock and create documents for their assigned cost center
- **Cannot**: Change warehouse or cost center assignments
- **Warehouse is**: Automatically fetched from Healthcare Settings

### Administrators & System Managers
- **Can**: Create/modify warehouse assignments in Healthcare Settings
- **Can**: Override warehouse in documents if needed (override detected)
- **Cannot**: Be restricted to specific cost centers

## How It Works - Technical Details

### Stock Ledger (`get_stock_ledger`)
```
User selects cost center 
  → System looks up warehouse in Healthcare Settings
  → Retrieves stock for that warehouse
```

### Stock Reconciliation (`create_stock_reconciliation`)
```
User submits reconciliation for cost center
  → Default warehouse is set from Healthcare Settings
  → Only admins can override warehouse value
  → System validates permissions before allowing override
```

### Material Receipt (`create_material_receipt`)
```
User receives materials for cost center
  → Default warehouse is set from Healthcare Settings
  → Purchase receipt is created with correct warehouse
  → Only admins can select different warehouse
```

### Material Request (`create_material_request`)
```
User creates material request for cost center
  → Default warehouse is set from Healthcare Settings
  → Material request is targeted to that warehouse
  → Only admins can change warehouse
```

## API Functions

### For Backend/Integration

#### Get Warehouse for Cost Center
```python
from healthcare.api.common import get_warehouse_for_cost_center

warehouse = get_warehouse_for_cost_center("Nursing Department")
# Returns: "Main Store"
```

#### Get All Warehouses for Cost Center
```python
from healthcare.api.common import get_warehouses_for_cost_center

warehouses = get_warehouses_for_cost_center("Nursing Department")
# Returns: [{"name": "Main Store", "label": "Main Store"}]
```

#### Validate Permission to Change Warehouse
```python
from healthcare.api.common import validate_warehouse_change_permission

validate_warehouse_change_permission()
# Raises error if user is not Admin/System Manager
```

### For Frontend/APIs

#### Get Default Warehouse and Cost Center
```
GET /api/method/healthcare.api.nursing_inventory.get_default_warehouse_and_cost_center

Returns:
{
  "warehouse": "Main Store",
  "cost_center": "Nursing Department",
  "can_change_warehouse": false
}
```

#### Get Warehouses for Cost Center
```
GET /api/method/healthcare.api.nursing_inventory.get_warehouses_for_cost_center?cost_center=Nursing%20Department

Returns:
[
  {"name": "Main Store", "label": "Main Store"}
]
```

#### Get Stock Ledger
```
GET /api/method/healthcare.api.nursing_inventory.get_stock_ledger?cost_center=Nursing%20Department

Returns: List of stock items with quantities
```

## Example Workflows

### Workflow 1: Creating Stock Reconciliation

1. Nurse user goes to Nursing Inventory > Stock Reconciliation
2. Selects Cost Center: "ICU - Department"
3. System automatically sets Warehouse: "ICU Store"
4. Nurse cannot change warehouse (not admin)
5. Adds items and submits

### Workflow 2: Material Receipt

1. Pharmacy user receives supplies
2. Selects Cost Center: "Laboratory"
3. System sets Warehouse: "Lab Storage"
4. Creates PO with items
5. System creates Purchase Receipt in correct warehouse

### Workflow 3: Admin Override

1. Admin user creates Stock Reconciliation
2. Can see warehouse from settings
3. Can override warehouse if needed
4. System logs the override
5. Document is created with overridden warehouse

## Troubleshooting

### Issue: "No warehouse found for cost center in Healthcare Settings"

**Cause**: The cost center doesn't have a warehouse configured in Healthcare Settings > Nurse Mini Warehouse

**Solution**: 
1. Go to Healthcare Settings
2. Add a row in Nurse Mini Warehouse table
3. Select the warehouse and cost center

### Issue: Users see different warehouses

**Cause**: Inconsistent configuration in Healthcare Settings

**Solution**:
1. Audit Healthcare Settings > Nurse Mini Warehouse
2. Ensure each cost center maps to only one warehouse
3. Update employee cost center assignments if needed

### Issue: Admin override not working

**Cause**: User is not in Admin/System Manager role

**Solution**:
1. Go to User record
2. Add "Administrator" or "System Manager" role
3. Save and retry

## Configuration Files Modified

1. **healthcare/api/common.py** - Added warehouse lookup functions
2. **healthcare/api/nursing_inventory.py** - Updated operations to use settings

## Backward Compatibility

- Old warehouse assignments via Warehouse > Cost Center field still work
- New Healthcare Settings configuration takes precedence
- Can migrate gradually from old system to new one

## Security Implications

✅ **Benefits:**
- Regular users cannot change warehouse assignments
- Ensures data integrity by cost center
- Prevents accidental transactions in wrong warehouse
- Only admins can make exceptions

⚠️ **Considerations:**
- Healthcare Settings must be properly configured
- Cost center permissions must be properly set up
- Regular audits recommended

## Next Steps

1. Configure Nurse Mini Warehouse in Healthcare Settings
2. Test with a small group of users
3. Document standard warehouse allocations
4. Train users on the new system
5. Migrate existing data if needed
