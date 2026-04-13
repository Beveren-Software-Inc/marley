# Test script for the fixed get_stock_ledger function
import frappe
from healthcare.api.nursing_inventory import get_stock_ledger

def test_get_stock_ledger():
    """Test the get_stock_ledger function with a sample cost center"""
    try:
        # Test with a sample cost center (adjust this based on your data)
        cost_center = "Nursing Department"  # Replace with actual cost center name

        print(f"Testing get_stock_ledger with cost center: {cost_center}")

        # Call the function
        result = get_stock_ledger(cost_center)

        print(f"Function returned {len(result)} items")

        # Check structure of first item if any
        if result:
            first_item = result[0]
            print("First item structure:")
            for key, value in first_item.items():
                print(f"  {key}: {value} ({type(value).__name__})")

            # Verify required fields are present
            required_fields = ['item_code', 'item_name', 'current_stock', 'reorder_level']
            missing_fields = [field for field in required_fields if field not in first_item]
            if missing_fields:
                print(f"ERROR: Missing required fields: {missing_fields}")
            else:
                print("✓ All required fields present")

        print("✓ Test completed successfully")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Initialize Frappe (you may need to adjust this based on your setup)
    # frappe.init(site="your-site-name")
    # frappe.connect()

    test_get_stock_ledger()