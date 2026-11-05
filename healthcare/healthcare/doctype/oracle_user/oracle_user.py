# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

# Legacy USER_GROUP_01 (GROUP_NUM -> GROUP_NAM): what the user is in the clinic.
USER_GROUP_MAP = {
	1: "NORMAL USER",
	2: "CONSULTANT",
	3: "GP",
	4: "SPECIALIST",
	5: "PSYCHOLOGIST",
}

# Cache of USR_NUM -> name used by healthcare.api.usr_00_01_import name lookups.
USER_NAME_CACHE_KEY = "healthcare:oracle_user:names"


class OracleUser(Document):
	def validate(self):
		self.status_flag = self.status_flag or 0
		# Legacy STA_FLG: 1 = the user can log on, 0 = locked / retired.
		self.is_active = 1 if self.status_flag == 1 else 0
		if not self.user_group:
			self.user_group = USER_GROUP_MAP.get(self.group_num or 0, "")

	def on_update(self):
		frappe.cache().delete_value(USER_NAME_CACHE_KEY)

	def on_trash(self):
		frappe.cache().delete_value(USER_NAME_CACHE_KEY)
