# -*- coding: utf-8 -*-
# Copyright (c) 2025, Healthcare and contributors
# For license information, please see license.txt

from frappe.model.document import Document

class MorseFallScale(Document):
	def validate(self):
		self.calculate_total_points()

	def calculate_total_points(self):
		"""Calculate total points from child table"""
		total = 0
		if self.morse_fall_scale_detail:
			for row in self.morse_fall_scale_detail:
				if row.points:
					total += row.points
		self.total_points = total










