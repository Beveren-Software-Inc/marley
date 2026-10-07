// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Income by Doctor Patient and Source"] = {
	filters: [
		{
			fieldname: "group_by",
			label: __("Group By"),
			fieldtype: "Select",
			options: "Doctor\nPatient\nSource",
			default: "Doctor",
			reqd: 1,
		},
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
			fieldname: "billing_source",
			label: __("Billing Source"),
			fieldtype: "Select",
			options: "Sales Invoice\nSales Order",
			default: "Sales Invoice",
			reqd: 1,
		},
		{
			fieldname: "limit",
			label: __("Limit"),
			fieldtype: "Int",
			default: 50,
			depends_on:
				"eval:frappe.query_report.get_filter_value('group_by')==='Patient'",
			description: __(
				"Top patients by net (HTML shows ~50 rows; scroll for the rest)"
			),
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
			print_ibdps_html(report);
		});
	},

	after_refresh(report) {
		const msg = report.raw_data && report.raw_data.message;
		if (
			typeof msg === "string" &&
			(msg.includes("dwia-report") || msg.includes("sia-report") || msg.includes("pwia-report"))
		) {
			report._ibdps_html = msg;
		} else {
			report._ibdps_html = null;
		}
	},
};

function get_ibdps_html(report) {
	if (report._ibdps_html) return report._ibdps_html;

	const selectors = [".dwia-report", ".sia-report", ".pwia-report"];
	for (const sel of selectors) {
		const from_message =
			report.$report_message && report.$report_message.find(sel)[0];
		if (from_message) return from_message.outerHTML;
		const from_page = report.page && $(report.page.main).find(sel)[0];
		if (from_page) return from_page.outerHTML;
	}

	const raw = report.raw_data && report.raw_data.message;
	if (
		typeof raw === "string" &&
		(raw.includes("dwia-report") || raw.includes("sia-report") || raw.includes("pwia-report"))
	) {
		return raw;
	}
	return "";
}

function print_ibdps_html(report) {
	const filters = report.get_values
		? report.get_values()
		: frappe.query_report.get_filter_values();
	const mode = (filters.group_by || "Doctor").trim();
	const title =
		mode === "Source"
			? __("Income by Source")
			: mode === "Patient"
				? __("Income by Patient")
				: __("Income by Doctor");

	// Prefer HTML already rendered above the datatable
	const cached = get_ibdps_html(report);
	if (cached) {
		open_print_window(cached, title);
		return;
	}

	const api_filters = Object.assign({}, filters, {
		source: filters.billing_source || filters.source || "Sales Invoice",
		include_chart: 1,
	});

	let method = "healthcare.api.doctor_wise_income_analysis.get_doctor_wise_income_analysis_html";
	if (mode === "Source") {
		method = "healthcare.api.doctor_wise_income_analysis.get_source_income_analysis_html";
	} else if (mode === "Patient") {
		method = "healthcare.api.patient_wise_income_analysis.get_patient_wise_income_analysis_html";
	}

	frappe.call({
		method,
		args: { filters: api_filters },
		freeze: true,
		freeze_message: __("Building print layout..."),
		callback(r) {
			open_print_window(r.message, title);
		},
	});
}

function open_print_window(html, title) {
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
	w.document.write(`<!doctype html><html><head><title>${title}</title>
		<style>
			body { margin: 12px; font-family: Arial, Helvetica, sans-serif; }
			@media print {
				@page { size: A3 landscape; margin: 8mm; }
				body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
			}
		</style></head><body>${html}</body></html>`);
	w.document.close();
	w.focus();
	setTimeout(() => w.print(), 300);
}
