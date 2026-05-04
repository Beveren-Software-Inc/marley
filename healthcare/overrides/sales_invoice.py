
from healthcare.api.patient_visit import update_patient_visit_status



def on_submit(self):
    visit_name = None
    if getattr(self, "custom_reference_type", None) == "Patient Visit" and getattr(self, "custom_reference_name", None):
        visit_name = self.custom_reference_name
    elif getattr(self, "custom_base_reference", None) == "Patient Visit" and getattr(
        self, "custom_base_reference_name", None
    ):
        visit_name = self.custom_base_reference_name
    if visit_name:
        update_patient_visit_status(
            visit_name=visit_name,
            action="invoice_created",
            doc_name=self.name,
        )