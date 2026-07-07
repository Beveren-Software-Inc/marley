from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add a Scientific / Generic Name field on Item so doctors can see and
	search drugs by their scientific (generic) name alongside the commercial name."""
	create_custom_fields(
		{
			"Item": [
				{
					"fieldname": "custom_scientific_name",
					"label": "Scientific / Generic Name",
					"fieldtype": "Data",
					"insert_after": "item_name",
					"translatable": 0,
					"description": "Generic / scientific name of the drug (shown to doctors in prescriptions).",
				},
			],
		}
	)
