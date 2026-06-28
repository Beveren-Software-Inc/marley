// Copyright (c) 2026, earthians Health Informatics Pvt. Ltd. and contributors
// For license information, please see license.txt

function insurance_payment_needs_bank_reference(mode_of_payment, mop_type) {
  if (!mode_of_payment) return false;
  if (mop_type === "Bank") return true;
  return /cheque|check/i.test(mode_of_payment);
}

function toggle_insurance_bank_reference_fields(dialog, mode_of_payment) {
  if (!mode_of_payment) {
    dialog.set_value("_show_bank_reference", 0);
    dialog.set_value("reference_no", "");
    dialog.set_value("reference_date", "");
    return;
  }

  frappe.db.get_value("Mode of Payment", mode_of_payment, "type", (r) => {
    const mop_type = (r && r.type) || "";
    const needs = insurance_payment_needs_bank_reference(mode_of_payment, mop_type);
    dialog.set_value("_show_bank_reference", needs ? 1 : 0);
    if (!needs) {
      dialog.set_value("reference_no", "");
      dialog.set_value("reference_date", "");
    }
  });
}

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
          docstatus: 1,
          outstanding_amount: [">", 0],
        },
      };
    });

    if (frm.doc.docstatus !== 2 && frm.doc.status !== "Rejected") {
      frm.add_custom_button(
        __("Reject Claim"),
        function () {
          frappe.confirm(
            __("Mark Insurance Claim {0} as Rejected?", [frm.doc.name]),
            function () {
              frappe.call({
                method: "healthcare.api.common.reject_insurance_claim",
                args: { claim_name: frm.doc.name },
                freeze: true,
                callback() {
                  frappe.show_alert({ message: __("Claim rejected"), indicator: "red" });
                  frm.reload_doc();
                },
              });
            }
          );
        },
        __("Actions")
      );
    }

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
                reqd: 1,
              },
              {
                fieldtype: "Link",
                fieldname: "mode_of_payment",
                label: __("Mode of Payment"),
                options: "Mode of Payment",
                reqd: 1,
              },
              {
                fieldtype: "Check",
                fieldname: "_show_bank_reference",
                hidden: 1,
                default: 0,
              },
              {
                fieldtype: "Data",
                fieldname: "reference_no",
                label: __("Reference No"),
                depends_on: "eval:doc._show_bank_reference",
                mandatory_depends_on: "eval:doc._show_bank_reference",
              },
              {
                fieldtype: "Date",
                fieldname: "reference_date",
                label: __("Reference Date"),
                default: frappe.datetime.get_today(),
                depends_on: "eval:doc._show_bank_reference",
                mandatory_depends_on: "eval:doc._show_bank_reference",
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
            </p>
            <p class="text-muted small">
              ${__("Reference No and Reference Date are required when paying by Bank or Cheque.")}
            </p>`;
          d.get_field("info").$wrapper.html(info_html);

          d.fields_dict.mode_of_payment.df.onchange = function () {
            toggle_insurance_bank_reference_fields(d, d.get_value("mode_of_payment"));
          };

          d.set_primary_action(__("Update"), () => {
            const values = d.get_values();
            if (!values) return;

            frappe.call({
              method: "healthcare.healthcare.api.insurance_claim.update_insurance_claim_payment",
              args: {
                name: frm.doc.name,
                paid_amount: values.paid_amount,
                mode_of_payment: values.mode_of_payment,
                reference_no: values.reference_no,
                reference_date: values.reference_date,
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
