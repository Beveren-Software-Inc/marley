// Copyright (c) 2025, Healthcare and contributors
// For license information, please see license.txt

frappe.ui.form.on('Inpatient Package', {
    refresh: function(frm) {

        frm.set_query('reference', 'services', function(doc, cdt, cdn) {
            let row = locals[cdt][cdn];

            return {
                filters: row.reference_doctype === 'Healthcare Service Template'
                    ? { disabled: 0 }
                    : {}
            };
        });
    }
});

frappe.ui.form.on('Inpatient Package Service', {
    service_type: async function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        await frappe.model.set_value(cdt, cdn, 'reference', '');

        let doctype = '';

        if (row.service_type === 'Room') {
            doctype = 'Healthcare Service Unit';
        } else if (row.service_type === 'Service') {
            doctype = 'Healthcare Service Template';
        } else if (row.service_type === 'Procedure') {
            doctype = 'Clinical Procedure Template';
        } else if (row.service_type === 'Item') {
            doctype = 'Item';
        }

        if (!doctype) return;

        await frappe.model.set_value(cdt, cdn, 'reference_doctype', doctype);
        frm.refresh_field('services');

        if (row.service_type !== 'Service') {
            return;
        }

        frappe.confirm(
            'Would you like to include all enabled services in this package?',
            async function() {
                let result = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Healthcare Service Template',
                        filters: { disabled: 0 },
                        fields: ['name'],
                        limit_page_length: 0
                    }
                });

                add_services(frm, result.message || [], cdt, cdn);
            },
            function() {
                show_service_selection_dialog(frm, cdt, cdn);
            }
        );
    },

    is_unlimited: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.is_unlimited) {
            frappe.model.set_value(cdt, cdn, 'quantity_days', 0);
        }
    },

    quantity_days: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.quantity_days > 0) {
            frappe.model.set_value(cdt, cdn, 'is_unlimited', 0);
        }
    }
});

function add_services(frm, services, cdt, cdn) {
    let existing = new Set(
        (frm.doc.services || [])
            .filter(row => row.reference)
            .map(row => row.reference)
    );

    let target_row = locals[cdt] && locals[cdt][cdn];
    let added = 0;

    services.forEach(service => {
        if (existing.has(service.name)) return;

        let row;

        if (target_row && !target_row.reference) {
            row = target_row;
            target_row = null;
        } else {
            row = frm.add_child('services');
        }

        row.service_type = 'Service';
        row.reference_doctype = 'Healthcare Service Template';
        row.reference = service.name;
        row.quantity_days = 0;
        row.is_unlimited = 0;

        existing.add(service.name);
        added++;
    });

    frm.refresh_field('services');

    frappe.show_alert({
        message: `${added} services added`,
        indicator: 'green'
    });
}

function show_service_selection_dialog(frm, cdt, cdn) {
    let dialog = new frappe.ui.form.MultiSelectDialog({
        doctype: 'Healthcare Service Template',
        target: frm,
        setters: {},
        add_filters_group: 1,

        get_query() {
            return {
                filters: {
                    disabled: 0
                }
            };
        },

        action(selections) {
            add_services(
                frm,
                (selections || []).map(name => ({ name })),
                cdt,
                cdn
            );

            dialog.dialog.hide();
        }
    });
}
