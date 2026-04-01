
from healthcare.api.patient_visit import update_patient_visit_status



def on_submit(self):
    if self.custom_base_reference=="Patient Visit":
        update_patient_visit_status(
            visit_name=self.custom_base_reference_name,
            action="invoice_created",
            doc_name=self.name,
        )