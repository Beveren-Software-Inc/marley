// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.query_reports["Doctor Wise Income Analysis"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.year_start(),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "period",
			label: __("Period"),
			fieldtype: "Select",
			options: "Yearly\nQuarterly\nMonthly",
			default: "Yearly",
			reqd: 1,
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "cost_center",
			label: __("Branch / Cost Center"),
			fieldtype: "Link",
			options: "Cost Center",
		},
		{
			fieldname: "source",
			label: __("Billing Source"),
			fieldtype: "Select",
			options: "Sales Invoice\nSales Order",
			default: "Sales Invoice",
			reqd: 1,
		},
		{
			fieldname: "paid_only",
			label: __("Paid Only"),
			fieldtype: "Check",
			default: 0,
		},
		{
			fieldname: "exclude_medicines",
			label: __("Exclude Medicines"),
			fieldtype: "Check",
			default: 0,
		},
	],

	onload(report) {
		report.page.add_inner_button(__("Print HTML"), () => {
			print_dwia_html(report);
		});
	},

	after_refresh(report) {
		const msg = report.raw_data && report.raw_data.message;
		if (typeof msg === "string" && msg.includes("dwia-report")) {
			report._dwia_html = msg;
		}
	},
};

function get_dwia_html(report) {
	if (report._dwia_html) return report._dwia_html;

	const from_message =
		report.$report_message && report.$report_message.find(".dwia-report")[0];
	if (from_message) return from_message.outerHTML;

	const from_page = report.page && $(report.page.main).find(".dwia-report")[0];
	if (from_page) return from_page.outerHTML;

	const raw = report.raw_data && report.raw_data.message;
	if (typeof raw === "string" && raw.includes("dwia-report")) return raw;

	return "";
}

function print_dwia_html(report) {
	const html = get_dwia_html(report);
	if (!html) {
		frappe.msgprint(__("No HTML report found. Refresh the report, then try Print HTML again."));
		return;
	}
	const w = window.open("", "_blank");
	if (!w) {
		frappe.msgprint(__("Pop-up blocked. Allow pop-ups to print."));
		return;
	}
	w.document.open();
	w.document.write(`<!doctype html><html><head><title>${__("Doctor Wise Income Analysis")}</title>
		<style>
			body { margin: 12px; font-family: Arial, Helvetica, sans-serif; }
			@media print { @page { size: A3 landscape; margin: 8mm; } }
		</style></head><body>${html}</body></html>`);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 300);
}
