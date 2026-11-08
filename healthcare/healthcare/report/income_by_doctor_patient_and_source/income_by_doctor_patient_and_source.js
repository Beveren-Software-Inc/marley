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
			on_change(report) {
				// Defining on_change suppresses the default report refresh, so
				// every path here must end in exactly one refresh.
				// The doctor filter is hidden outside Doctor view — clear it so a
				// stale Healthcare Practitioner link is not sent with the run.
				if (
					report.get_filter_value("group_by") !== "Doctor" &&
					report.get_filter_value("practitioner")
				) {
					// Clearing the filter re-runs the report through its own
					// change handler.
					report.set_filter_value("practitioner", "");
					return;
				}
				report.refresh(true);
			},
		},
		{
			fieldname: "practitioner",
			label: __("Healthcare Practitioner"),
			// Autocomplete, not Link: Link filters are permission checked on the
			// server before the report runs, which blocks report users who cannot
			// read Healthcare Practitioner (e.g. users with an Employee user
			// permission). The list is filled from onload below.
			fieldtype: "Autocomplete",
			depends_on:
				"eval:frappe.query_report.get_filter_value('group_by')==='Doctor'",
			description: __(
				"Doctor view: pick a doctor to see only his income. With Detailed ticked, one table of the services billed for that doctor is shown."
			),
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
		{
			fieldname: "detailed",
			label: __("Detailed"),
			fieldtype: "Check",
			default: 0,
			depends_on:
				"eval:frappe.query_report.get_filter_value('group_by')==='Source' || frappe.query_report.get_filter_value('group_by')==='Doctor'",
			description: __(
				"Doctor: one table of services billed for the selected practitioner. Source: show each billed service (rooms, visits, therapy); Lab becomes Lab Income."
			),
		},
	],

	onload(report) {
		load_practitioner_options(report);
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

function load_practitioner_options(report) {
	// The Healthcare Practitioner filter is an Autocomplete control, so its list
	// has to be supplied by us. The options come from the server so every role
	// that can run this report gets the full doctor list (Link filters are
	// permission checked on the server before the report runs, which fails for
	// users without read access on Healthcare Practitioner).
	const field = report.get_filter("practitioner");
	if (!field || typeof field.set_data !== "function") return;

	frappe
		.xcall(
			"healthcare.api.doctor_wise_income_analysis.get_practitioner_filter_options",
			// Disabled doctors are not offered, but a doctor picked earlier and
			// disabled since must still resolve to his name, not his ID.
			{ include: report.get_filter_value("practitioner") || null }
		)
		.then((options) => field.set_data(options || []))
		.then(() => {
			// Re-apply any value set from the URL so the label shows the doctor
			// name instead of the raw ID.
			const value = report.get_filter_value("practitioner");
			if (value) field.set_value(value);
		})
		.catch(() => {
			// Leave the picker empty rather than blocking the report.
		});
}

function get_ibdps_html(report) {
	if (report._ibdps_html) return report._ibdps_html;

	// The raw message carries every HTML block (summary + detailed drill-down),
	// so prefer it over a single DOM section.
	const raw = report.raw_data && report.raw_data.message;
	if (
		typeof raw === "string" &&
		(raw.includes("dwia-report") || raw.includes("sia-report") || raw.includes("pwia-report"))
	) {
		return raw;
	}

	const selectors = [".dwia-report", ".sia-report", ".pwia-report"];
	for (const sel of selectors) {
		const from_message =
			report.$report_message && report.$report_message.find(sel)[0];
		if (from_message) return from_message.outerHTML;
		const from_page = report.page && $(report.page.main).find(sel)[0];
		if (from_page) return from_page.outerHTML;
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
