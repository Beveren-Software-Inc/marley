frappe.provide('healthcare.discharge_finance_checklist');

const API = 'healthcare.api.discharge_finance_checklist';

frappe.pages['discharge-finance-checklist'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Discharge Financial Check'),
		single_column: true,
	});

	const finance_page = new healthcare.discharge_finance_checklist.Page(page);

	$(wrapper).bind('show', () => {
		const admission =
			(frappe.route_options && frappe.route_options.admission) ||
			frappe.utils.get_query_params().admission;
		if (admission) {
			finance_page.load_checklist(admission);
			if (frappe.route_options) {
				frappe.route_options.admission = null;
			}
		}
	});
};

healthcare.discharge_finance_checklist.Page = class DischargeFinanceChecklistPage {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.admission = null;
		this.items = [];
		this.filters = {
			from_date: '',
			to_date: '',
			pending_only: 1,
		};
		this.make();
		this.refresh_queue();
	}

	make() {
		this.wrapper.addClass('finance-discharge-page');
		this.wrapper.html(`
			<div class="queue-section"></div>
			<div class="detail-section" style="display:none;"></div>
		`);
		this.queue_section = this.wrapper.find('.queue-section');
		this.detail_section = this.wrapper.find('.detail-section');

		this.page.set_primary_action(__('Refresh'), () => {
			if (this.admission) {
				this.load_checklist(this.admission);
			} else {
				this.refresh_queue();
			}
		});
	}

	format_amount(amount) {
		return format_currency(flt(amount || 0), frappe.defaults.get_default('currency'));
	}

	render_filters() {
		return `
			<div class="filter-bar">
				<div class="filter-field">
					<label>${__('Discharge From')}</label>
					<input type="date" class="form-control input-sm filter-from-date" value="${frappe.utils.escape_html(this.filters.from_date || '')}" />
				</div>
				<div class="filter-field">
					<label>${__('Discharge To')}</label>
					<input type="date" class="form-control input-sm filter-to-date" value="${frappe.utils.escape_html(this.filters.to_date || '')}" />
				</div>
				<div class="filter-field">
					<label class="d-block">&nbsp;</label>
					<label class="checkbox-inline" style="font-size:12px;">
						<input type="checkbox" class="filter-pending-only" ${this.filters.pending_only ? 'checked' : ''} />
						${__('Pending only')}
					</label>
				</div>
				<div class="filter-field">
					<label class="d-block">&nbsp;</label>
					<button type="button" class="btn btn-default btn-sm btn-clear-filters">${__('Clear')}</button>
				</div>
			</div>
		`;
	}

	read_filters_from_form() {
		const card = this.queue_section.find('.pending-card');
		if (!card.length) return;
		this.filters.from_date = card.find('.filter-from-date').val() || '';
		this.filters.to_date = card.find('.filter-to-date').val() || '';
		this.filters.pending_only = card.find('.filter-pending-only').is(':checked') ? 1 : 0;
	}

	bind_filter_events() {
		const card = this.queue_section.find('.pending-card');
		card.find('.filter-from-date, .filter-to-date, .filter-pending-only').on('change', () => {
			this.read_filters_from_form();
			this.fetch_queue();
		});
		card.find('.btn-clear-filters').on('click', () => {
			this.filters = { from_date: '', to_date: '', pending_only: 1 };
			this.refresh_queue();
		});
	}

	fetch_queue() {
		const body = this.queue_section.find('.queue-body');
		body.html(`<div class="empty-state">${__('Loading…')}</div>`);

		frappe
			.call({
				method: `${API}.list_finance_discharge_pending`,
				args: {
					limit: 100,
					from_date: this.filters.from_date || undefined,
					to_date: this.filters.to_date || undefined,
					pending_only: this.filters.pending_only,
				},
			})
			.then((r) => {
				const rows = r.message || [];
				this.render_queue(rows);
			})
			.catch((err) => {
				body.html(
					`<div class="empty-state text-danger">${frappe.utils.escape_html(
						err?.message || __('Failed to load list')
					)}</div>`
				);
			});
	}

	refresh_queue() {
		this.admission = null;
		this.items = [];
		this.detail_section.hide();
		this.queue_section.show();
		this.page.clear_secondary_action();
		this.page.set_title(__('Discharge Financial Check'));

		this.queue_section.html(`
			<div class="pending-card">
				<div class="card-header">
					<h4>${__('Discharge financial checks')}</h4>
					<p>${__('Accounts checklist items for inpatient admissions in discharge.')}</p>
				</div>
				${this.render_filters()}
				<div class="queue-body">
					<div class="empty-state">${__('Loading…')}</div>
				</div>
			</div>
		`);
		this.bind_filter_events();
		this.fetch_queue();
	}

	render_queue(rows) {
		const body = this.queue_section.find('.queue-body');

		if (!rows.length) {
			body.html(`<div class="empty-state">${__('No admissions match your filters.')}</div>`);
			return;
		}

		const table = $(`
			<table class="table table-bordered table-hover" style="margin:0;">
				<thead>
					<tr>
						<th>${__('Admission')}</th>
						<th>${__('Patient')}</th>
						<th>${__('Discharge Date')}</th>
						<th>${__('Branch')}</th>
						<th class="text-right">${__('Invoice Total')}</th>
						<th class="text-right">${__('Outstanding')}</th>
						<th>${__('Checklist')}</th>
					</tr>
				</thead>
				<tbody></tbody>
			</table>
		`);

		const tbody = table.find('tbody');
		rows.forEach((row) => {
			const pending_label =
				cint(row.pending_count) > 0
					? `<span class="indicator orange">${row.pending_count}/${row.total_count}</span>`
					: `<span class="indicator green">${__('Done')}</span>`;
			const tr = $(`
				<tr class="pending-row">
					<td>${frappe.utils.escape_html(row.admission || '')}</td>
					<td>${frappe.utils.escape_html(row.patient_name || row.patient || '')}</td>
					<td>${row.discharge_date ? frappe.datetime.str_to_user(row.discharge_date) : ''}</td>
					<td>${frappe.utils.escape_html(row.cost_center || '')}</td>
					<td class="text-right">${frappe.utils.escape_html(this.format_amount(row.invoice_total))}</td>
					<td class="text-right">${frappe.utils.escape_html(this.format_amount(row.outstanding_amount))}</td>
					<td>${pending_label}</td>
				</tr>
			`);
			tr.on('click', () => this.load_checklist(row.admission));
			tbody.append(tr);
		});

		body.empty().append(table);
	}

	load_checklist(admission_name) {
		if (!admission_name) return;

		this.admission = admission_name;
		this.queue_section.hide();
		this.detail_section.show();
		this.page.set_title(__('Discharge Financial Check'));
		this.page.set_secondary_action(__('Back to list'), () => this.refresh_queue());

		this.detail_section.html(`
			<div class="detail-card">
				<div class="patient-banner">
					<div class="empty-state">${__('Loading checklist…')}</div>
				</div>
				<div class="checklist-body"></div>
				<div class="card-footer text-right" style="padding:12px 16px;border-top:1px solid var(--border-color,#e2e8f0);">
					<button type="button" class="btn btn-primary btn-save-checklist">${__('Save')}</button>
				</div>
			</div>
		`);

		frappe
			.call({
				method: `${API}.get_finance_discharge_checklist`,
				args: { admission_name },
			})
			.then((r) => {
				const data = r.message || {};
				this.items = data.checklist_items || [];
				this.render_detail(data);
			})
			.catch((err) => {
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: err?.message || __('Failed to load checklist'),
				});
				this.refresh_queue();
			});
	}

	render_detail(data) {
		const banner = this.detail_section.find('.patient-banner');
		const invoice_line = data.invoice_count
			? `${__('Invoices')}: <strong>${data.invoice_count}</strong>${
					cint(data.draft_invoice_count) > 0
						? ` <span class="text-muted">(${data.draft_invoice_count} ${__('draft')})</span>`
						: ''
				}
				&nbsp;·&nbsp;
				${__('Total')}: <strong>${frappe.utils.escape_html(this.format_amount(data.invoice_total))}</strong>
				&nbsp;·&nbsp;
				${__('Outstanding')}: <strong>${frappe.utils.escape_html(this.format_amount(data.outstanding_amount))}</strong>`
			: `<span class="text-muted">${__('No invoices linked to this admission')}</span>`;

		banner.html(`
			<div class="name">${frappe.utils.escape_html(data.patient_name || data.patient || '')}</div>
			<div class="meta">
				${__('Admission')}: <strong>${frappe.utils.escape_html(data.admission || '')}</strong>
				&nbsp;·&nbsp;
				${__('Discharge Date')}: <strong>${data.discharge_date ? frappe.datetime.str_to_user(data.discharge_date) : '—'}</strong>
				&nbsp;·&nbsp;
				${__('Branch')}: <strong>${frappe.utils.escape_html(data.cost_center || '')}</strong>
				&nbsp;·&nbsp;
				${__('Status')}: <strong>${frappe.utils.escape_html(data.admission_status || '')}</strong>
			</div>
			<div class="meta" style="margin-top:6px;">${invoice_line}</div>
		`);

		const body = this.detail_section.find('.checklist-body');
		if (!this.items.length) {
			body.html(
				`<div class="empty-state">${__('No Accounts checklist items on this discharge.')}</div>`
			);
			this.detail_section.find('.btn-save-checklist').prop('disabled', true);
			return;
		}

		body.empty();
		this.items.forEach((item) => {
			const row = this.render_item_row(item);
			body.append(row);
		});

		this.detail_section.find('.btn-save-checklist').off('click').on('click', () => this.save());
	}

	render_item_row(item) {
		const checked = cint(item.click) === 1;
		const row = $(`
			<div class="checklist-item ${checked ? 'done' : ''}" data-name="${frappe.utils.escape_html(
				item.name || ''
			)}">
				<input type="checkbox" ${checked ? 'checked' : ''} />
				<div class="flex-grow">
					<div class="item-title">${frappe.utils.escape_html(item.action_required || '')}</div>
					<div class="item-meta">
						${item.department_label || item.department ? frappe.utils.escape_html(item.department_label || item.department) : ''}
						${checked && item.date_time ? ` · ${__('Completed')} ${frappe.datetime.str_to_user(item.date_time)}` : ''}
						${checked && item.name1 ? ` · ${frappe.utils.escape_html(item.name1)}` : ''}
					</div>
				</div>
			</div>
		`);

		const can_uncheck =
			frappe.user.has_role('Administrator') || frappe.user.has_role('System Manager');
		if (checked && !can_uncheck) {
			row.find('input[type="checkbox"]').prop('disabled', true);
		}

		row.find('input[type="checkbox"]').on('change', (e) => {
			const is_checked = e.target.checked;
			if (!is_checked && !can_uncheck) {
				e.target.checked = true;
				frappe.show_alert({
					message: __('Completed checklist items cannot be unchecked.'),
					indicator: 'orange',
				});
				return;
			}
			item.click = is_checked ? 1 : 0;
			if (is_checked) {
				item.date_time = frappe.datetime.now_datetime();
				item.user = frappe.session.user;
				item.name1 = frappe.session.user_fullname || frappe.session.user;
				row.addClass('done');
				if (!can_uncheck) {
					$(e.target).prop('disabled', true);
				}
			} else {
				item.date_time = '';
				item.user = '';
				item.name1 = '';
				row.removeClass('done');
			}
			const meta = row.find('.item-meta');
			if (is_checked) {
				meta.text(
					`${item.department_label || item.department || ''} · ${__('Completed')} ${frappe.datetime.str_to_user(
						item.date_time
					)} · ${item.name1 || ''}`
				);
			} else {
				meta.text(item.department_label || item.department || '');
			}
		});

		return row;
	}

	save() {
		if (!this.admission) return;

		const btn = this.detail_section.find('.btn-save-checklist');
		btn.prop('disabled', true);

		const payload = this.items.map((item) => ({
			name: item.name,
			click: cint(item.click),
			user: item.user || '',
			name1: item.name1 || '',
			date_time: item.date_time || '',
			description: item.description || '',
		}));

		frappe
			.call({
				method: `${API}.save_finance_discharge_checklist`,
				args: {
					admission_name: this.admission,
					checklist: payload,
				},
			})
			.then((r) => {
				const data = r.message || {};
				this.items = data.checklist_items || [];
				this.render_detail(data);
				frappe.show_alert({
					message: __('Financial checklist saved'),
					indicator: 'green',
				});
				if (cint(data.pending_count) === 0) {
					setTimeout(() => this.refresh_queue(), 800);
				}
			})
			.catch((err) => {
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: err?.message || __('Failed to save checklist'),
				});
			})
			.always(() => {
				btn.prop('disabled', false);
			});
	}
};
