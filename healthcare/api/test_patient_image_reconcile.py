# Copyright (c) 2026, Healthcare contributors
# See license.txt

from frappe.tests import UnitTestCase

from healthcare.api.patient_image_reconcile import choose_patient_images, classify_patient_image


class TestPatientImageReconcile(UnitTestCase):
	def test_the_label_decides_the_image_and_the_extension_does_not(self):
		front = classify_patient_image("861343-PHOTO_CPR_FRONT.tiff")
		back = classify_patient_image("861343 CPR BACK.png")
		signature = classify_patient_image("190791-2249-SIGNATURE_01.jpeg")
		plain = classify_patient_image("190791-SIGN.tff")
		self.assertEqual(front["kind"], "cpr_front")
		self.assertEqual(front["file_no"], "861343")
		self.assertEqual(back["kind"], "cpr_back")
		self.assertEqual(signature["kind"], "signature")
		self.assertEqual(signature["admission_key"], "2249")
		self.assertEqual(plain["kind"], "signature")
		self.assertIsNone(plain["admission_key"])
		self.assertIsNone(classify_patient_image("861343-NOTE.pdf"))
		self.assertIsNone(classify_patient_image("notes-CPR-FRONT.jpg"))

	def test_an_image_the_patient_already_has_is_not_uploaded_again(self):
		files = [
			classify_patient_image("861343-PHOTO_CPR_FRONT.jpg"),
			classify_patient_image("861343-PHOTO_CPR_FRONT.png"),
			classify_patient_image("861343-PHOTO_CPR_BACK.jpg"),
			classify_patient_image("861343-SIGN.jpg"),
			classify_patient_image("861343-SIGNATURE_02.jpg"),
			classify_patient_image("999-PHOTO_CPR_FRONT.jpg"),
		]
		stored = {
			"861343": {"found": True, "front": True, "back": False, "signature": True},
			"999": {"found": False, "front": False, "back": False, "signature": False},
		}
		choice = choose_patient_images(files, stored)
		self.assertEqual([row["filename"] for row in choice["chosen"]], ["861343-PHOTO_CPR_BACK.jpg"])
		self.assertEqual(choice["already"]["cpr_front"], 1)
		self.assertEqual(choice["already"]["signature"], 1)
		self.assertEqual(choice["duplicate_files"], 2)
		self.assertEqual(choice["patients_missing"], ["999"])
