// Copyright (c) 2026, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctor Wise Income Analysis", {
	refresh(frm) {
		frm.disable_save();
		frm.page.set_primary_action(__("Generate Analysis"), () => generate_analysis(frm));

		frm.add_custom_button(__("Print"), () => {
			if (!has_analysis(frm)) {
				frappe.msgprint(__("Generate the analysis first."));
				return;
			}
			frappe.utils.print(
				"Doctor Wise Income Analysis",
				frm.doc.name,
				"Doctor Wise Income Analysis"
			);
		});

		render_report(frm);
	},
});

function has_analysis(frm) {
	const raw = frm.doc.analysis_json;
	if (!raw) return false;
	if (typeof raw === "object") return !!(raw.periods && raw.periods.length);
	try {
		const parsed = JSON.parse(raw);
		return !!(parsed && parsed.periods && parsed.periods.length);
	} catch (e) {
		return false;
	}
}

function generate_analysis(frm) {
	if (!frm.doc.from_date || !frm.doc.to_date) {
		frappe.msgprint(__("Please set From Date and To Date."));
		return;
	}
	if (!frm.doc.period) {
		frappe.msgprint(__("Please select a Period (Yearly / Quarterly / Monthly)."));
		return;
	}
	frm.call({
		doc: frm.doc,
		method: "generate_analysis",
		freeze: true,
		freeze_message: __("Generating Doctor Wise Income Analysis..."),
		callback(r) {
			frm.reload_doc().then(() => {
				if (r.message && r.message.message) {
					frappe.show_alert({ message: r.message.message, indicator: "green" });
				}
				if (r.message && r.message.html) {
					set_report_html(frm, r.message.html);
				} else {
					render_report(frm);
				}
			});
		},
	});
}

function set_report_html(frm, html) {
	const wrap = frm.fields_dict.report_html;
	if (!wrap || !wrap.$wrapper) return;
	wrap.$wrapper.html(
		`<div style="overflow:auto;max-width:100%;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:8px;">${html}</div>`
	);
}

function render_report(frm) {
	const wrap = frm.fields_dict.report_html;
	if (!wrap || !wrap.$wrapper) return;

	if (!has_analysis(frm)) {
		wrap.$wrapper.html(`
			<div class="dwia-empty" style="padding:24px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;">
				<div style="font-size:15px;font-weight:600;margin-bottom:6px;">${__("Doctor Wise Income Analysis")}</div>
				<div>${__("Set From / To and Period (Yearly, Quarterly, or Monthly), then click Generate Analysis.")}</div>
			</div>
		`);
		return;
	}

	wrap.$wrapper.html(
		`<div class="text-muted" style="padding:12px;">${__("Loading report…")}</div>`
	);
	frappe.call({
		method: "healthcare.api.doctor_wise_income_analysis.render_doctor_wise_income_analysis",
		args: { doc: frm.doc.name },
		callback(r) {
			if (r.message) set_report_html(frm, r.message);
		},
	});
}
