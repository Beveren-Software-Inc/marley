from frappe.custom.doctype.custom_field.custom_field import delete_custom_fields


def execute():
	# The standard fields reuse the same columns. Delete metadata only before schema sync.
	delete_custom_fields(
		{
			"Inpatient Package": ("custom_include_lab_tests", "custom_include_observation"),
			"Room Category": (
				"custom_does_it_include_medical_supervision",
				"custom_medical_supervision_rate",
			),
			"Healthcare Service Template": ("custom_consultation", "custom_therapy"),
		},
		bypass_hooks=True,
	)
