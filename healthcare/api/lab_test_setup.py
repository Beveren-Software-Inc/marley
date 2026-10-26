# Copyright (c) 2026, Healthcare contributors
# See license.txt
"""Lab Test Template setup helpers.

Two things happen automatically when lab test templates are created from the
setup UI:

* the lab test code is generated from the highest code reached so far
  (``LAB-001`` → ``LAB-002``), and under a group the next child code is used
  (``LAB-129-001`` → ``LAB-129-002``);
* a new group template also gets its first child template
  (``LAB-129`` → ``LAB-129-001``) copied from the group, so the panel can be
  edited straight away.
"""

from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.utils import cint

LAB_CODE_PREFIX = "LAB"
LAB_CODE_DIGITS = 3

_TOP_LEVEL_CODE_RE = re.compile(rf"^{LAB_CODE_PREFIX}-(\d+)$", re.IGNORECASE)

# Result formats that must not be inherited by the auto-created child: a child
# of a panel holds the actual result, so "Grouped" becomes "Single".
_CHILD_RESULT_FALLBACK = "Single"
_GROUP_RESULT_FORMAT = "Grouped"

# Legacy Oracle identifiers — never duplicated onto a new child template.
_LEGACY_FIELDS = ("old_num", "cr_id", "cr_date", "up_id", "up_date", "sta_flg")


def format_lab_code(number: int) -> str:
	"""``2`` → ``LAB-002`` (grows past 999 without truncating)."""
	return f"{LAB_CODE_PREFIX}-{int(number):0{LAB_CODE_DIGITS}d}"


def format_child_lab_code(parent: str, number: int) -> str:
	"""``LAB-129``, ``3`` → ``LAB-129-003``."""
	return f"{(parent or '').strip()}-{int(number):0{LAB_CODE_DIGITS}d}"


def _lab_template_names(like: str) -> list[str]:
	return frappe.get_all(
		"Lab Test Template",
		filters={"name": ("like", like)},
		pluck="name",
		limit=0,
		ignore_permissions=True,
	)


def next_top_level_lab_code() -> str:
	"""Next ``LAB-NNN`` after the highest top-level code in the system."""
	numbers = []
	for name in _lab_template_names(f"{LAB_CODE_PREFIX}-%"):
		match = _TOP_LEVEL_CODE_RE.match((name or "").strip())
		if match:
			numbers.append(int(match.group(1)))
	return format_lab_code(max(numbers, default=0) + 1)


def next_child_lab_code(parent: str) -> str:
	"""Next ``<parent>-NNN`` after the highest existing child of *parent*."""
	parent = (parent or "").strip()
	if not parent:
		return ""
	child_re = re.compile(rf"^{re.escape(parent)}-(\d+)$", re.IGNORECASE)
	numbers = []
	for name in _lab_template_names(f"{parent}-%"):
		match = child_re.match((name or "").strip())
		if match:
			numbers.append(int(match.group(1)))
	return format_child_lab_code(parent, max(numbers, default=0) + 1)


@frappe.whitelist()
def get_next_lab_test_code(parent_group: str | None = None) -> str:
	"""Next lab test code to prefill the create dialog.

	With *parent_group* the next child code of that group is returned
	(``LAB-129-002``), otherwise the next top-level code (``LAB-130``).
	"""
	parent = (parent_group or "").strip()
	if parent:
		return next_child_lab_code(parent)
	return next_top_level_lab_code()


def create_first_group_child(group_doc) -> str | None:
	"""Create ``<group>-001`` for a freshly created group template.

	The child copies the group details (name, rates, sample, result setup, …)
	so only the analyte specifics need editing. Returns the child name, or
	``None`` when nothing was created.
	"""
	if not cint(group_doc.get("is_group")):
		return None
	if not (group_doc.get("name") or "").strip():
		return None
	if frappe.flags.in_import or frappe.flags.in_migrate or frappe.flags.in_patch:
		# Imports/patches bring their own children — do not invent one.
		return None
	if group_doc.get("lab_test_groups"):
		return None
	if frappe.db.exists("Lab Test Template", {"lab_group": group_doc.name}):
		return None

	child_code = next_child_lab_code(group_doc.name)
	if not child_code:
		return None

	child = frappe.copy_doc(group_doc)
	child.no = child_code
	child.lab_test_code = child_code
	child.lab_test_name = group_doc.lab_test_name or child_code
	child.is_group = 0
	child.lab_group = group_doc.name
	child.link_existing_item = 0
	child.item = None
	child.lab_test_groups = []
	for fieldname in _LEGACY_FIELDS:
		if child.meta.has_field(fieldname):
			child.set(fieldname, None)
	result_format = (child.lab_test_template_type or "").strip()
	if result_format in ("", _GROUP_RESULT_FORMAT):
		child.lab_test_template_type = _CHILD_RESULT_FALLBACK
	child.insert(ignore_permissions=True)
	return child.name


def ensure_lab_test_code(doc) -> None:
	"""Fill ``no`` / ``lab_test_code`` for a new Lab Test Template.

	Used from ``before_insert`` so templates created from any client (setup UI,
	desk form, API) always carry the next incremental code. User supplied codes
	are kept untouched.
	"""
	code = (doc.get("no") or "").strip()
	if not code:
		if doc.get("link_existing_item") and doc.get("item"):
			code = (doc.item or "").strip()
		else:
			parent = (doc.get("lab_group") or "").strip()
			use_parent = parent if parent and not cint(doc.get("is_group")) else None
			code = get_next_lab_test_code(use_parent)
		doc.no = code

	if not doc.get("link_existing_item") and not (doc.get("lab_test_code") or "").strip():
		doc.lab_test_code = doc.no

	if not (doc.get("no") or "").strip():
		frappe.throw(_("Lab Test No could not be generated. Please set it manually."))
