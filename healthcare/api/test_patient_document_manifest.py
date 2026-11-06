# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.patient_document_manifest import (
	file_is_present,
	parse_manifest_csv,
	plan_manifest_import,
)


MANIFEST = """RELATIVE_PATH,PATIENT_FILE_NO,FILE_EXISTS,DOCUMENT_TYPE
group/small/162322/report.pdf,162322,Y,Medical Report
outer/group/small/999/missing.pdf,999,N,Medical Report
group/small/162322/report.pdf,162322,YES,Medical Report
group/small/100/scan.pdf,100,1,Discharge Document
"""


class TestPatientDocumentManifest(UnitTestCase):
	def test_file_exists_must_say_the_file_is_present(self):
		self.assertTrue(file_is_present("Y"))
		self.assertTrue(file_is_present(" yes "))
		self.assertTrue(file_is_present("1"))
		self.assertFalse(file_is_present("N"))
		self.assertFalse(file_is_present(""))
		self.assertFalse(file_is_present("0"))

	def test_a_file_in_the_folder_is_imported_even_when_the_column_says_false(self):
		rows = parse_manifest_csv(MANIFEST)
		uploaded = [
			"Patient_Documents_PDF/manifest_final.csv",
			"Patient_Documents_PDF/major/group/small/162322/report.pdf",
			"Patient_Documents_PDF/major/group/small/999/missing.pdf",
			"Patient_Documents_PDF/major/other/DOC_4362_VGZRSM8Z2HTS.pdf",
		]
		plan = plan_manifest_import(rows, uploaded)
		self.assertEqual(
			[row["path"] for row in plan["chosen"]],
			[
				"Patient_Documents_PDF/major/group/small/162322/report.pdf",
				"Patient_Documents_PDF/major/group/small/999/missing.pdf",
				"Patient_Documents_PDF/major/other/DOC_4362_VGZRSM8Z2HTS.pdf",
			],
		)
		self.assertEqual(plan["chosen"][2]["patient_file_no"], "")
		self.assertEqual(plan["chosen"][2]["legacy_visit"], "4362")
		self.assertEqual(plan["outside_manifest"], 1)
		self.assertEqual(plan["file_exists_no"], 1)
		self.assertEqual(plan["duplicates"], 1)
		self.assertEqual(plan["not_in_folder"], 1)
