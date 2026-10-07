// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.query_reports["Source Income Analysis"] = {
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
			print_sia_html(report);
		});
	},
};

function print_sia_html(report) {
	const filters = report.get_values
		? report.get_values()
		: frappe.query_report.get_filter_values();
	if (!filters.from_date || !filters.to_date) {
		frappe.msgprint(__("Please set From Date and To Date."));
		return;
	}

	frappe.call({
		method: "healthcare.api.doctor_wise_income_analysis.get_source_income_analysis_html",
		args: { filters },
		freeze: true,
		freeze_message: __("Building print layout..."),
		callback(r) {
			const html = r.message;
			if (!html || typeof html !== "string") {
				frappe.msgprint(__("Could not build print HTML. Refresh the report and try again."));
				return;
			}
			const w = window.open("", "_blank");
			if (!w) {
				frappe.msgprint(__("Pop-up blocked. Allow pop-ups to print."));
				return;
			}
			w.document.open();
			w.document.write(`<!doctype html><html><head><title>${__("Source Income Analysis")}</title>
				<style>
					body { margin: 12px; font-family: Arial, Helvetica, sans-serif; }
					@media print {
						@page { size: A4 landscape; margin: 8mm; }
						body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
					}
				</style></head><body>${html}</body></html>`);
			w.document.close();
			w.focus();
			setTimeout(() => w.print(), 300);
		},
	});
}
