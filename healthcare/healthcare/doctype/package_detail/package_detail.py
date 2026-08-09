from frappe.model.document import Document
from frappe.utils import cint, date_diff, getdate


class PackageDetail(Document):
	def validate(self):
		if self.from_date and self.to_date:
			# Inclusive day count
			self.total_days = max(date_diff(getdate(self.to_date), getdate(self.from_date)) + 1, 1)
		elif not self.total_days:
			self.total_days = cint(self.total_days or 0)
