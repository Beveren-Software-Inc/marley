/**
 * Make the sidebar "Website" dropdown button open /desk (back to desk) instead of site root.
 * In v16 the Website button normally opens window.location.origin; this overrides it to open /desk.
 */
(function () {
	frappe.provide("frappe.ui");
	const Original = frappe.ui.SidebarHeader;
	if (!Original) return;
	frappe.ui.SidebarHeader = class SidebarHeaderWebsiteToDesk extends Original {
		constructor(sidebar) {
			super(sidebar);
			const website = this.dropdown_items && this.dropdown_items.find((d) => d.name === "website");
			if (website && website.onClick) {
				website.onClick = function () {
					window.open(window.location.origin + "/desk");
				};
			}
		}
	};
})();
