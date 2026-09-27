# Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Accounting entries for the doctor commission flow.

Two entries are needed once a doctor's commission is approved:

* :func:`create_journal_entry_for_payroll` runs on *Doctor Commission Payroll*
  submit. It debits each doctor's commission expense account (the doctor's own
  *Healthcare Practitioner* Expense Account, else the payroll row's, else
  *Healthcare Settings* Default Expense Account) and credits the payable account
  configured in *Healthcare Settings*, using the employee linked to the doctor
  as the party.
* :func:`create_payment_entry_for_payslip` is triggered by the **Create Payment
  Entry** button on a submitted *Commission Payslip*. It debits that same payable
  and credits the bank/cash account the commission is paid from.
* :func:`on_payment_entry_cancel` runs when such a payment is cancelled: the
  payslip goes back to *Submitted* so the commission is payable again.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate


def get_default_payable_account() -> str:
	"""Payable account credited with doctor commission (Healthcare Settings)."""
	return (frappe.db.get_single_value("Healthcare Settings", "default_payable_account") or "").strip()


def get_default_expense_account() -> str:
	"""Fallback commission expense account (Healthcare Settings)."""
	return (frappe.db.get_single_value("Healthcare Settings", "default_expense_account") or "").strip()


def get_commission_mode_of_payment() -> str:
	"""Mode of payment used to pay doctor commission (Healthcare Settings)."""
	return (
		frappe.db.get_single_value("Healthcare Settings", "mode_of_payment_for_commission") or ""
	).strip()


def commission_amount(row) -> float:
	"""The commission of a payroll doctor row: adjusted when set, else calculated."""
	adjusted = row.get("adjusted_commission")
	if adjusted is not None and adjusted != "":
		return flt(adjusted)
	return flt(row.get("calculated_commission"))


def _validate_account(account: str, label: str, company: str | None = None):
	if not account:
		frappe.throw(
			_("{0} is not set. Please set it in Healthcare Settings.").format(label),
			title=_("Missing Account"),
		)

	account_company = frappe.db.get_value("Account", account, "company")
	if not account_company:
		frappe.throw(_("Account {0} does not exist.").format(account), title=_("Invalid Account"))

	if company and account_company != company:
		frappe.throw(
			_("Account {0} does not belong to company {1}.").format(account, company),
			title=_("Invalid Account"),
		)


def _throw_problems(problems, title):
	message = "<br>".join([_("Cannot post the doctor commission:")] + [f"• {p}" for p in problems])
	frappe.throw(message, title=title)

def get_practitioner_expense_account(practitioner: str) -> str:
	"""The Expense Account the doctor keeps on *Healthcare Practitioner*.

	Blank when the doctor has none, or on sites whose Healthcare Practitioner has
	no Expense Account field.
	"""
	if not practitioner:
		return ""
	if not frappe.get_meta("Healthcare Practitioner").has_field("expense_account"):
		return ""
	return (frappe.db.get_value("Healthcare Practitioner", practitioner, "expense_account") or "").strip()


def resolve_doctor_expense_account(row, default_expense_account: str | None = None) -> str:
	"""Commission expense account debited for one doctor's journal line.

	Precedence:

	1. the account held on the payroll row — filled in from the doctor and editable
	   there for a one-off correction;
	2. the doctor's own Expense Account on *Healthcare Practitioner*, so a doctor
	   who keeps his own account is posted to it even on a payroll generated before
	   that account was filled in;
	3. ``default_expense_account``, itself defaulting to the *Healthcare Settings*
	   Default Expense Account — the last resort for doctors without their own.
	"""
	account = (row.get("expense_account") or "").strip()
	if account:
		return account

	account = get_practitioner_expense_account((row.get("practitioner") or "").strip())
	if account:
		return account

	if default_expense_account is None:
		default_expense_account = get_default_expense_account()
	return (default_expense_account or "").strip()


def build_payroll_ledger_rows(payroll_doc, default_expense_account: str | None = None):
	"""Split the doctors of a payroll into Journal Entry rows.

	Returns ``(expense_rows, payable_rows, problems)``:

	* ``expense_rows`` — one row per doctor: ``account``, ``cost_center``,
	  ``amount`` and ``practitioner_name`` (debit side).
	* ``payable_rows`` — grouped per linked employee: ``employee``, ``amount`` and
	  ``doctors`` (credit side).
	* ``problems`` — human readable reasons a doctor row could not be posted.

	Each expense account comes from :func:`resolve_doctor_expense_account`.

	Pass ``default_expense_account`` to override the Healthcare Settings lookup
	(used by tests); pass ``""`` for "no fallback account is configured".
	"""
	if default_expense_account is None:
		default_expense_account = get_default_expense_account()

	expense_rows: list[dict] = []
	payable_by_employee: dict[str, dict] = {}
	problems: list[str] = []

	for row in payroll_doc.doctors or []:
		amount = commission_amount(row)
		if amount <= 0:
			continue

		doctor = row.get("practitioner_name") or row.get("practitioner") or ""
		expense_account = resolve_doctor_expense_account(row, default_expense_account)
		if not expense_account:
			problems.append(
				_(
					"{0}: no expense account — set the doctor's Expense Account, "
					"or the Default Expense Account in Healthcare Settings."
				).format(doctor)
			)
			continue

		employee = (row.get("employee") or "").strip()
		if not employee:
			problems.append(_("{0}: no Employee linked to the doctor.").format(doctor))
			continue

		expense_rows.append(
			{
				"account": expense_account,
				"cost_center": row.get("cost_center"),
				"amount": amount,
				"practitioner_name": doctor,
			}
		)

		bucket = payable_by_employee.setdefault(
			employee, {"employee": employee, "amount": 0.0, "doctors": []}
		)
		bucket["amount"] += amount
		bucket["doctors"].append(doctor)

	return expense_rows, list(payable_by_employee.values()), problems



def create_journal_entry_for_payroll(payroll_doc):
	"""Insert and submit the Journal Entry that books the payroll's commission."""
	if not payroll_doc.doctors:
		frappe.throw(_("No doctors on this payroll to post."), title=_("Nothing to Post"))

	company = payroll_doc.company
	if not company:
		frappe.throw(_("Company is required to post doctor commission."), title=_("Missing Company"))

	payable_account = get_default_payable_account()
	_validate_account(payable_account, _("Default Payable Account"), company)

	expense_rows, payable_rows, problems = build_payroll_ledger_rows(payroll_doc)

	if problems:
		_throw_problems(problems, _("Incomplete Doctor Details"))

	if not expense_rows:
		frappe.throw(_("No commission amount found on this payroll."), title=_("Nothing to Post"))

	for row in expense_rows:
		_validate_account(row["account"], _("Commission Expense Account"), company)

	journal_entry = frappe.new_doc("Journal Entry")
	journal_entry.voucher_type = "Journal Entry"
	journal_entry.company = company
	journal_entry.posting_date = payroll_doc.get("payroll_date") or nowdate()
	journal_entry.user_remark = _("Doctor commission for {0}").format(payroll_doc.name)

	# Debit each doctor's commission expense (on the branch the cases were billed from).
	for row in expense_rows:
		journal_entry.append(
			"accounts",
			{
				"account": row["account"],
				"cost_center": row["cost_center"],
				"debit_in_account_currency": row["amount"],
				"user_remark": _("Commission - {0}").format(row["practitioner_name"]),
			},
		)

	# Credit the payable account once per doctor, so each doctor's ledger is clear.
	for row in payable_rows:
		journal_entry.append(
			"accounts",
			{
				"account": payable_account,
				"party_type": "Employee",
				"party": row["employee"],
				"credit_in_account_currency": row["amount"],
				"user_remark": _("Commission payable - {0}").format(
					", ".join(sorted(set(row["doctors"])))
				),
			},
		)

	journal_entry.insert()
	journal_entry.submit()
	return journal_entry


def cancel_journal_entry_for_payroll(payroll_doc):
	"""Cancel the Journal Entry created from this payroll, when still submitted."""
	journal_entry_name = payroll_doc.get("journal_entry")
	if not journal_entry_name or not frappe.db.exists("Journal Entry", journal_entry_name):
		return

	if frappe.db.get_value("Journal Entry", journal_entry_name, "docstatus") == 1:
		journal_entry = frappe.get_doc("Journal Entry", journal_entry_name)
		journal_entry.flags.ignore_permissions = True
		journal_entry.cancel()




def _account_is_usable(account: str | None, company: str) -> bool:
	"""A non-group, enabled ledger account belonging to the company."""
	if not account:
		return False
	details = frappe.db.get_value("Account", account, ["company", "is_group", "disabled"], as_dict=True)
	if not details or details.company != company or details.is_group or details.disabled:
		return False
	return True


def _mode_of_payment_account(mode_of_payment: str | None, company: str) -> str | None:
	"""Account configured for this Mode of Payment on the company."""
	if not mode_of_payment:
		return None
	account = frappe.db.get_value(
		"Mode of Payment Account", {"parent": mode_of_payment, "company": company}, "default_account"
	)
	return account if _account_is_usable(account, company) else None


def resolve_paid_from_account(company: str, employee: str, mode_of_payment: str | None) -> str:
	"""Bank/cash account the commission is paid from.

	Prefers the account last used to pay this employee, then the Mode of Payment
	configured in Healthcare Settings, then the company's default bank/cash account.
	"""
	account = frappe.db.get_value(
		"Payment Entry",
		{
			"party_type": "Employee",
			"party": employee,
			"company": company,
			"docstatus": 1,
			"paid_from": ["is", "set"],
		},
		"paid_from",
		order_by="posting_date desc, creation desc",
	)
	if _account_is_usable(account, company):
		return account

	account = _mode_of_payment_account(mode_of_payment, company)
	if account:
		return account

	for field in ("default_bank_account", "default_cash_account"):
		account = frappe.db.get_value("Company", company, field)
		if _account_is_usable(account, company):
			return account

	account = frappe.db.get_value(
		"Account",
		{"company": company, "is_group": 0, "disabled": 0, "account_type": ["in", ["Bank", "Cash"]]},
		"name",
		order_by="creation asc",
	)
	if account:
		return account

	frappe.throw(
		_("No bank or cash account found to pay doctor commission from for company {0}.").format(company),
		title=_("Missing Account"),
	)


def _assert_same_currency(paid_from: str, paid_to: str, company: str):
	"""Both legs must use one currency, otherwise the entry cannot balance."""
	from_currency = frappe.db.get_value("Account", paid_from, "account_currency")
	to_currency = frappe.db.get_value("Account", paid_to, "account_currency")
	if from_currency != to_currency:
		frappe.throw(
			_(
				"Account {0} is in {1} and account {2} is in {3}. Doctor commission payments need both accounts in the same currency."
			).format(paid_from, from_currency, paid_to, to_currency),
			title=_("Currency Mismatch"),
		)


def create_payment_entry_for_payslip(payslip):
	"""Insert and submit the Payment Entry that pays one doctor's commission."""
	if payslip.get("payment_entry"):
		# A cancelled (or deleted) Payment Entry is not a payment any more, so the
		# stale link is dropped and the commission can be paid again.
		if cint(frappe.db.get_value("Payment Entry", payslip.payment_entry, "docstatus")) == 1:
			frappe.throw(
				_("Payment Entry {0} already exists for this payslip.").format(payslip.payment_entry),
				title=_("Already Paid"),
			)
		frappe.db.set_value(
			"Commission Payslip", payslip.name, "payment_entry", None, update_modified=False
		)
		payslip.payment_entry = None

	docstatus = cint(
		payslip.get("docstatus") or frappe.db.get_value("Commission Payslip", payslip.name, "docstatus")
	)
	if docstatus != 1:
		frappe.throw(
			_("Submit Commission Payslip {0} first: only an approved payslip can be paid.").format(
				payslip.name
			),
			title=_("Payslip Not Submitted"),
		)

	company = payslip.company
	if not company:
		frappe.throw(
			_("Company is required on the Commission Payslip to create a payment."),
			title=_("Missing Company"),
		)

	payroll = payslip.doctor_commission_payroll
	if not payroll or not frappe.db.exists("Doctor Commission Payroll", payroll):
		frappe.throw(
			_("This payslip is not linked to a Doctor Commission Payroll."),
			title=_("Missing Payroll"),
		)

	if frappe.db.get_value("Doctor Commission Payroll", payroll, "docstatus") != 1:
		frappe.throw(
			_(
				"Submit Doctor Commission Payroll {0} first: the commission is credited to the payable account when the payroll is submitted."
			).format(payroll),
			title=_("Payroll Not Submitted"),
		)

	employee = (payslip.employee or "").strip()
	if not employee:
		frappe.throw(
			_("No Employee is linked to doctor {0}. Please link an employee first.").format(
				payslip.practitioner_name or payslip.practitioner
			),
			title=_("Missing Employee"),
		)

	if not frappe.db.exists("Employee", {"name": employee, "status": "Active"}):
		frappe.throw(_("Employee {0} is not active.").format(employee), title=_("Invalid Employee"))

	amount = flt(payslip.total_commission)
	if amount <= 0:
		frappe.throw(
			_("There is no commission amount to pay on this payslip."), title=_("Nothing to Pay")
		)

	payable_account = get_default_payable_account()
	_validate_account(payable_account, _("Default Payable Account"), company)

	mode_of_payment = get_commission_mode_of_payment()
	paid_from = resolve_paid_from_account(company, employee, mode_of_payment)
	_assert_same_currency(paid_from, payable_account, company)

	journal_entry = frappe.db.get_value(
		"Doctor Commission Payroll", payslip.doctor_commission_payroll, "journal_entry"
	)

	payment_entry = frappe.new_doc("Payment Entry")
	payment_entry.payment_type = "Pay"
	payment_entry.company = company
	payment_entry.posting_date = nowdate()
	payment_entry.mode_of_payment = mode_of_payment
	payment_entry.party_type = "Employee"
	payment_entry.party = employee
	payment_entry.paid_from = paid_from
	payment_entry.paid_to = payable_account
	payment_entry.paid_amount = amount
	payment_entry.received_amount = amount
	if payslip.cost_center:
		payment_entry.cost_center = payslip.cost_center
	payment_entry.reference_no = journal_entry or payslip.doctor_commission_payroll or payslip.name
	payment_entry.reference_date = nowdate()
	payment_entry.remarks = _("Doctor commission for {0} ({1})").format(
		payslip.practitioner_name or payslip.practitioner, payslip.name
	)

	payment_entry.insert()
	payment_entry.submit()

	frappe.db.set_value(
		"Commission Payslip",
		payslip.name,
		{"payment_entry": payment_entry.name, "status": "Paid"},
		update_modified=False,
	)
	return payment_entry


def on_payment_entry_cancel(doc, method=None):
	"""Release a commission payslip whose payment was cancelled.

	Hook: *Payment Entry* ``on_cancel``. Cancelling the payment takes the money
	out of the doctor's payable account, so the payslip is payable again: the
	link to the cancelled entry is dropped and the status goes back to
	*Submitted*, which brings the **Create Payment Entry** button back on it.
	"""
	payslips = frappe.get_all(
		"Commission Payslip",
		filters={"payment_entry": doc.name, "docstatus": ["<", 2]},
		pluck="name",
	)
	for name in payslips:
		frappe.db.set_value(
			"Commission Payslip",
			name,
			{"payment_entry": None, "status": "Submitted"},
			update_modified=False,
		)
		frappe.get_doc("Commission Payslip", name).add_comment(
			"Comment",
			_("Payment Entry {0} was cancelled: the commission is payable again.").format(doc.name),
		)
