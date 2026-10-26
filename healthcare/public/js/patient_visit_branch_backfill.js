// Copyright (c) 2026, Healthcare contributors
// See license.txt
//
// "Backfill Branch on Patient Visits" — copies the branch (Cost Center) from the
// Daily Patient Visit Setup / Inpatient Admission onto Patient Visits that were
// created without one. Runs in the background; legacy (Oracle) visits are skipped.

(function () {
	const JOB = 'patient_visit_branch_backfill';

	function can_run() {
		return frappe.user.has_role('System Manager') || frappe.user.has_role('Healthcare Administrator');
	}

	function show_summary(progress) {
		if (progress.error) {
			frappe.msgprint({
				title: __('Branch backfill failed'),
				indicator: 'red',
				message: __('Check Error Log for details.'),
			});
			return;
		}
		frappe.show_alert({
			message: __(
				'Branch backfill finished — updated {0}, skipped {1}, errors {2}.',
				[progress.updated || 0, progress.skip || 0, progress.errors || 0]
			),
			indicator: Number(progress.errors) ? 'orange' : 'green',
		});
	}

	function poll_status() {
		frappe.call({
			method: 'healthcare.api.data_migration_jobs.get_migration_job_status',
			args: { job: JOB },
			callback(r) {
				const progress = r.message || {};
				if (progress.done) {
					show_summary(progress);
					return;
				}
				setTimeout(poll_status, 5000);
			},
		});
	}

	function start_backfill() {
		frappe.call({
			method: 'healthcare.api.data_migration_jobs.start_patient_visit_branch_backfill_migration',
			freeze: true,
			freeze_message: __('Starting background job…'),
			callback(r) {
				const out = r.message || {};
				if (!out.ok) return;
				frappe.show_alert({ message: out.message || __('Job started'), indicator: 'green' });
				poll_status();
			},
		});
	}

	function prompt_backfill() {
		frappe.call({
			method: 'healthcare.api.patient_visit_branch.preview_patient_visit_branch_backfill',
			callback(r) {
				const counts = r.message || {};
				frappe.confirm(
					__(
						'Copy the branch (Cost Center) from Daily Patient Visit Setup / Inpatient Admission onto Patient Visits without a branch?<br><br>'
							+ 'Visits to check: {0}<br>Sampled as updatable: {1}<br>Sampled with no branch source: {2}<br>Legacy (imported) visits skipped: {3}<br><br>'
							+ 'Runs in the background. New visits already copy the branch on creation. Continue?',
						[
							counts.candidates || 0,
							counts.resolvable_sampled || 0,
							counts.unresolved_sampled || 0,
							counts.legacy_skipped || 0,
						]
					),
					start_backfill
				);
			},
		});
	}

	frappe.ui.form.on('Daily Patient Visit Setup', {
		refresh(frm) {
			if (!can_run()) return;
			frm.add_custom_button(
				__('Backfill Branch on Patient Visits'),
				prompt_backfill,
				__('Actions')
			);
		},
	});

	const list_settings = (frappe.listview_settings['Daily Patient Visit Setup'] =
		frappe.listview_settings['Daily Patient Visit Setup'] || {});

	const previous_onload = list_settings.onload;
	list_settings.onload = function (listview) {
		if (previous_onload) previous_onload.call(this, listview);
		if (!can_run()) return;
		listview.page.add_inner_button(
			__('Backfill Branch on Patient Visits'),
			prompt_backfill
		);
	};
})();
