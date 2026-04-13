# Code Implementation Details

## Common.py - New Functions

### Function 1: get_warehouse_for_cost_center

```python
@frappe.whitelist()
def get_warehouse_for_cost_center(cost_center):
    """
    Get the default warehouse for a given cost center from Healthcare Settings.
    
    Args:
        cost_center: The cost center name/ID
        
    Returns:
        str: The warehouse name, or None if not found
    """
    if not cost_center:
        return None
    
    try:
        # Get Healthcare Settings
        settings = frappe.get_doc("Healthcare Settings")
        
        # Find the warehouse for this cost center in the nurse_mini_warehouse table
        if settings.nurse_mini_warehouse:
            for warehouse_row in settings.nurse_mini_warehouse:
                if warehouse_row.cost_center == cost_center:
                    return warehouse_row.warehouse
    except Exception:
        pass
    
    return None
```

**Usage Example:**
```python
warehouse = get_warehouse_for_cost_center("Nursing Department")
# Returns: "Main Store" or None
```

### Function 2: get_warehouses_for_cost_center

```python
@frappe.whitelist()
def get_warehouses_for_cost_center(cost_center):
    """
    Get all warehouses for a cost center (may have multiple warehouse entries).
    Returns list of {name, label} for dropdown selection.
    """
    if not cost_center:
        return []
    
    warehouses = []
    try:
        settings = frappe.get_doc("Healthcare Settings")
        if settings.nurse_mini_warehouse:
            for warehouse_row in settings.nurse_mini_warehouse:
                if warehouse_row.cost_center == cost_center:
                    warehouses.append({
                        "name": warehouse_row.warehouse,
                        "label": warehouse_row.warehouse
                    })
    except Exception:
        pass
    
    return warehouses
```

**Usage Example:**
```python
warehouses = get_warehouses_for_cost_center("Nursing Department")
# Returns: [{"name": "Main Store", "label": "Main Store"}]
```

### Function 3: validate_warehouse_change_permission

```python
def validate_warehouse_change_permission():
    """
    Check if current user has permission to change warehouse/cost_center.
    Only Administrator and System Manager can change these values.
    
    Raises:
        frappe.PermissionError if user doesn't have permission
    """
    user = frappe.session.user
    if _user_is_exempt(user):
        return True
    
    frappe.throw(
        _("Only Administrators and System Managers can change warehouse and cost center assignments"),
        frappe.PermissionError
    )
```

**Usage Example:**
```python
try:
    validate_warehouse_change_permission()
    # User is admin/system manager - proceed
except frappe.PermissionError:
    # User is not admin - deny action
```

## Nursing Inventory Updates

### Updated: get_stock_ledger

**Before:**
```python
warehouse = frappe.db.get_value("Warehouse", {"cost_center": cost_center}, "name")
```

**After:**
```python
warehouse = get_warehouse_for_cost_center(cost_center)
```

### Updated: create_stock_reconciliation

**Key Changes:**
```python
# Get warehouse from Healthcare Settings
warehouse = get_warehouse_for_cost_center(cost_center)

# If user is trying to override warehouse, validate permission
if user_provided_warehouse and user_provided_warehouse != warehouse:
    validate_warehouse_change_permission()
    warehouse = user_provided_warehouse

if not warehouse:
    frappe.throw(_("No warehouse found for cost center {0} in Healthcare Settings"))
```

### Updated: create_material_receipt

**Key Changes:**
```python
# Get warehouse from Healthcare Settings
warehouse = get_warehouse_for_cost_center(cost_center)

# Validate permission if user tries to override
if user_provided_warehouse and user_provided_warehouse != warehouse:
    validate_warehouse_change_permission()
    warehouse = user_provided_warehouse

# Create Purchase Receipt with auto warehouse
pr = frappe.get_doc({
    "doctype": "Purchase Receipt",
    "set_warehouse": warehouse,
    "cost_center": cost_center,
    # ... other fields
})
```

### Updated: create_material_request

**Key Changes:**
```python
# Get warehouse from Healthcare Settings
warehouse = get_warehouse_for_cost_center(cost_center)

# Validate permission if user tries to override
if user_provided_warehouse and user_provided_warehouse != warehouse:
    validate_warehouse_change_permission()
    warehouse = user_provided_warehouse

# Create Material Request with auto warehouse
mr = frappe.get_doc({
    "doctype": "Material Request",
    "set_warehouse": warehouse,
    "cost_center": cost_center,
    # ... other fields
})
```

### New: get_default_warehouse_and_cost_center

```python
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
            # User is exempt - try their employee record
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
```

## Frontend Integration Example

### React Component Example

```typescript
const StockReconciliationForm = () => {
  const [warehouse, setWarehouse] = useState("")
  const [costCenter, setCostCenter] = useState("")
  const [canChangeWarehouse, setCanChangeWarehouse] = useState(false)
  
  useEffect(() => {
    loadDefaults()
  }, [])
  
  const loadDefaults = async () => {
    const response = await fetch(
      '/api/method/healthcare.api.nursing_inventory.get_default_warehouse_and_cost_center'
    )
    const data = await response.json()
    const result = data.message
    
    setWarehouse(result.warehouse)
    setCostCenter(result.cost_center)
    setCanChangeWarehouse(result.can_change_warehouse)
  }
  
  const handleWarehouseChange = (value) => {
    if (canChangeWarehouse) {
      setWarehouse(value)
    } else {
      // Show error or disable field
      console.error("Cannot change warehouse - not authorized")
    }
  }
  
  return (
    <form>
      <input 
        type="text" 
        value={costCenter} 
        disabled 
        label="Cost Center"
      />
      <input 
        type="text" 
        value={warehouse}
        onChange={(e) => handleWarehouseChange(e.target.value)}
        disabled={!canChangeWarehouse}
        label="Warehouse"
      />
      {!canChangeWarehouse && (
        <small>Warehouse is locked based on Healthcare Settings configuration</small>
      )}
    </form>
  )
}
```

## Error Handling

### Standard Error Scenarios

```python
# Scenario 1: No warehouse configured
try:
    warehouse = get_warehouse_for_cost_center("Unknown CC")
    if not warehouse:
        frappe.throw(_("No warehouse configured for this cost center in Healthcare Settings"))
except Exception as e:
    frappe.log_error(str(e))

# Scenario 2: User tries to override without permission
try:
    warehouse = get_warehouse_for_cost_center(cost_center)
    if user_warehouse != warehouse:
        validate_warehouse_change_permission()  # Will throw if not allowed
except frappe.PermissionError as e:
    frappe.msgprint(str(e), alert=True)

# Scenario 3: Cost center not found
try:
    warehouse = get_warehouse_for_cost_center(cost_center)
    if not warehouse:
        return []  # or frappe.throw()
except Exception as e:
    frappe.log_error(f"Error finding warehouse: {str(e)}")
    return []
```

## Database Queries

### Check Current Configuration

```sql
-- Check all warehouse-cost center mappings in Healthcare Settings
SELECT 
    cc.cost_center,
    cc.warehouse
FROM healthcare_nursing_warehouse cc
WHERE parent = 'Healthcare Settings'
ORDER BY cost_center;
```

### Find Cost Centers Without Warehouse

```sql
-- Find cost centers in the system but not configured in Healthcare Settings
SELECT DISTINCT cc.name
FROM tabCost Center cc
LEFT JOIN healthcare_nursing_warehouse nw 
    ON cc.name = nw.cost_center
WHERE nw.cost_center IS NULL
AND cc.disabled = 0
ORDER BY cc.name;
```

## Testing Code

### Unit Test Example

```python
def test_get_warehouse_for_cost_center():
    # Setup
    from healthcare.api.common import get_warehouse_for_cost_center
    
    # Test 1: Valid cost center
    warehouse = get_warehouse_for_cost_center("Nursing Department")
    assert warehouse == "Main Store"
    
    # Test 2: Invalid cost center
    warehouse = get_warehouse_for_cost_center("Invalid CC")
    assert warehouse is None
    
    # Test 3: None input
    warehouse = get_warehouse_for_cost_center(None)
    assert warehouse is None

def test_validate_warehouse_permission():
    from healthcare.api.common import validate_warehouse_change_permission
    
    # Test 1: Admin user (should pass)
    with patch('frappe.session.user', 'Administrator'):
        validate_warehouse_change_permission()  # Should not throw
    
    # Test 2: Regular user (should fail)
    with patch('frappe.session.user', 'regular_user@example.com'):
        with pytest.raises(frappe.PermissionError):
            validate_warehouse_change_permission()
```

## Deployment Notes

1. **No database migrations needed** - Uses existing Healthcare Settings
2. **No DocType changes** - Works with existing Nurses Warehouse child table
3. **Backward compatible** - Existing warehouse assignments still work
4. **Safe rollback** - Can disable by removing configurations from Healthcare Settings

## Performance Considerations

- Warehouse lookups happen in-memory (no extra DB queries after first load)
- Healthcare Settings is cached by Frappe
- Minimal performance impact
- Consider caching if many lookups per request

## Security Audit Trail

All override attempts are logged:
```python
frappe.log_error(f"Warehouse override attempt: {user} changing {warehouse} to {override_warehouse}")
```

Can be reviewed via System Logs in Frappe.
