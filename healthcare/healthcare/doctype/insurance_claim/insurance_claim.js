// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Insurance Claim", {
  refresh(frm) {
    // Filter claim_items.sales_invoice_item to only show items from the linked Sales Invoice
    if (frm.doc.sales_invoice) {
      frappe.db
        .get_list("Sales Invoice Item", {
          filters: { parent: frm.doc.sales_invoice },
          fields: ["item_code"],
          limit: 500,
        })
        .then((rows) => {
          const item_codes = (rows || []).map((r) => r.item_code);
          frm.set_query("sales_invoice_item", "claim_items", function () {
            if (!item_codes.length) {
              return { filters: { name: ["in", []] } };
            }
            return {
              filters: {
                name: ["in", item_codes],
              },
            };
          });
        });
    }
    
    frm.set_query("sales_invoice", function () {
            return {
                filters: {
                    docstatus: 1,                 // submitted only (no draft, no cancelled)
                    outstanding_amount: [">", 0]  // not fully paid
                }
            };
        });

    if (frm.doc.docstatus === 1 && frm.doc.sales_invoice) {
      frm.add_custom_button(
        __("Update Cost"),
        function () {
          const d = new frappe.ui.Dialog({
            title: __("Update Insurance Payment"),
            fields: [
              {
                fieldtype: "Currency",
                fieldname: "paid_amount",
                label: __("Total Amount Paid"),
                default: frm.doc.total_amount_paid || 0,
                reqd: true,
              },
              {
                fieldtype: "Link",
                fieldname: "mode_of_payment",
                label: __("Mode of Payment"),
                options: "Mode of Payment",
                reqd: true,
              },
              {
                fieldtype: "HTML",
                fieldname: "info",
              },
            ],
          });

          const info_html = `
            <p class="text-muted">
              ${__(
                "This will create a Payment Entry against Sales Invoice {0} for the difference between the new total paid amount and the current total paid amount.",
                [frm.doc.sales_invoice]
              )}
            </p>`;
          d.get_field("info").$wrapper.html(info_html);

          d.set_primary_action(__("Update"), () => {
            const values = d.get_values();
            if (!values) return;

            frappe.call({
              method: "healthcare.healthcare.api.insurance_claim.update_insurance_claim_payment",
              args: {
                name: frm.doc.name,
                paid_amount: values.paid_amount,
                mode_of_payment: values.mode_of_payment,
              },
              freeze: true,
              freeze_message: __("Updating Insurance Claim and creating Payment Entry..."),
              callback(r) {
                d.hide();
                if (r.message && r.message.payment_entry) {
                  frappe.msgprint(
                    __(
                      "Payment Entry {0} created and Insurance Claim updated.",
                      [`<a href="/app/payment-entry/${r.message.payment_entry}">${r.message.payment_entry}</a>`]
                    )
                  );
                }
                frm.reload_doc();
              },
            });
          });

          d.show();
        },
        __("Actions")
      );
    }
  },
});

