sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "codeup/supplier/approvals/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, Fragment, formatter) {
    "use strict";

    return Controller.extend("codeup.supplier.approvals.controller.Main", {
        formatter: formatter,

        onInit: function () {
            var oViewModel = new JSONModel({
                busy: false,
                hasAuthError: false,
                authErrorMessage: "",
                selectedTab: "all",
                searchQuery: "",
                selectedCategory: "",
                sortField: "submissionDate",
                sortDescending: true,
                filteredCount: 0,
                counts: {
                    all: 0,
                    pending: 0,
                    approved: 0,
                    rejected: 0
                },
                columns: {
                    companyName: true,
                    contactPerson: true,
                    supplierEmail: true,
                    submissionDate: true,
                    status: true,
                    phone: false,
                    country: false,
                    category: false,
                    taxId: false,
                    website: false,
                    address: false,
                    notes: false
                }
            });
            this.getView().setModel(oViewModel, "viewModel");

            var oSubmissionsModel = new JSONModel({
                items: []
            });
            this.getView().setModel(oSubmissionsModel, "submissions");

            // Initial load of submissions directly from real CAP ApprovalService
            this._loadSubmissions();
        },

        /**
         * Returns resource bundle for internationalization.
         * @returns {sap.ui.model.resource.ResourceModel}
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Loads submissions from real CAP ApprovalService OData V4 endpoint.
         * Handles 401/403 authorization responses gracefully without fake client-side checks.
         * @param {boolean} [bShowToast=false] Whether to show success toast on refresh
         * @returns {Promise<void>}
         */
        _loadSubmissions: async function (bShowToast) {
            var oViewModel = this.getView().getModel("viewModel");
            var oSubmissionsModel = this.getView().getModel("submissions");
            var oBundle = this.getResourceBundle();

            oViewModel.setProperty("/busy", true);
            oViewModel.setProperty("/hasAuthError", false);

            try {
                // Read auth header if provided in local development or test environment
                var oHeaders = {
                    "Accept": "application/json"
                };
                var sStoredAuth = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("codeup_approver_auth") : null;
                if (sStoredAuth) {
                    oHeaders["Authorization"] = sStoredAuth;
                } else if (typeof window !== "undefined" && window.__APPROVAL_AUTH__) {
                    oHeaders["Authorization"] = window.__APPROVAL_AUTH__;
                }

                var oResponse = await fetch("/odata/v4/approval/Submissions", {
                    method: "GET",
                    headers: oHeaders
                });

                if (oResponse.status === 401) {
                    oViewModel.setProperty("/hasAuthError", true);
                    oViewModel.setProperty("/authErrorMessage", oBundle.getText("msgAuthRequired"));
                    oSubmissionsModel.setProperty("/items", []);
                    this._updateCounts([]);
                    return;
                }

                if (oResponse.status === 403) {
                    oViewModel.setProperty("/hasAuthError", true);
                    oViewModel.setProperty("/authErrorMessage", oBundle.getText("msgAccessDenied"));
                    oSubmissionsModel.setProperty("/items", []);
                    this._updateCounts([]);
                    return;
                }

                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status + ": " + oResponse.statusText);
                }

                var oData = await oResponse.json();
                var aItems = oData.value || [];

                oSubmissionsModel.setProperty("/items", aItems);
                this._updateCounts(aItems);
                this._applyFiltersAndSorting();

                if (bShowToast) {
                    MessageToast.show(oBundle.getText("msgDataRefreshed"));
                }
            } catch (oErr) {
                oViewModel.setProperty("/hasAuthError", true);
                oViewModel.setProperty("/authErrorMessage", oBundle.getText("msgError") + " (" + oErr.message + ")");
            } finally {
                oViewModel.setProperty("/busy", false);
            }
        },

        /**
         * Calculates tab counts from actual backend records.
         * @param {Array} aItems Array of submission entities from backend
         */
        _updateCounts: function (aItems) {
            var oViewModel = this.getView().getModel("viewModel");
            var aList = aItems || [];

            var iAll = aList.length;
            var iPending = aList.filter(function (o) { return o.status === "Pending"; }).length;
            var iApproved = aList.filter(function (o) { return o.status === "Approved"; }).length;
            var iRejected = aList.filter(function (o) { return o.status === "Rejected"; }).length;

            oViewModel.setProperty("/counts/all", iAll);
            oViewModel.setProperty("/counts/pending", iPending);
            oViewModel.setProperty("/counts/approved", iApproved);
            oViewModel.setProperty("/counts/rejected", iRejected);
        },

        /**
         * Applies active tab status, search query, category filters and sorting.
         */
        _applyFiltersAndSorting: function () {
            var oTable = this.byId("submissionsTable");
            if (!oTable) {
                return;
            }
            var oBinding = oTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            var oViewModel = this.getView().getModel("viewModel");
            var sSelectedTab = oViewModel.getProperty("/selectedTab");
            var sSearchQuery = oViewModel.getProperty("/searchQuery");
            var sSelectedCategory = oViewModel.getProperty("/selectedCategory");
            var sSortField = oViewModel.getProperty("/sortField") || "submissionDate";
            var bSortDescending = oViewModel.getProperty("/sortDescending");

            var aFilters = [];

            // 1. Status Filter (from IconTabBar)
            if (sSelectedTab && sSelectedTab !== "all") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sSelectedTab));
            }

            // 2. Category Filter (from ViewSettingsDialog)
            if (sSelectedCategory) {
                aFilters.push(new Filter("category", FilterOperator.EQ, sSelectedCategory));
            }

            // 3. Search Query Filter (matches @cds.search fields: companyName, contactPerson, supplierEmail, notes, taxId)
            if (sSearchQuery && sSearchQuery.trim().length > 0) {
                var sCleanQuery = sSearchQuery.trim();
                var aSearchFilters = [
                    new Filter("companyName", FilterOperator.Contains, sCleanQuery),
                    new Filter("contactPerson", FilterOperator.Contains, sCleanQuery),
                    new Filter("supplierEmail", FilterOperator.Contains, sCleanQuery),
                    new Filter("notes", FilterOperator.Contains, sCleanQuery),
                    new Filter("taxId", FilterOperator.Contains, sCleanQuery)
                ];
                aFilters.push(new Filter({
                    filters: aSearchFilters,
                    and: false
                }));
            }

            // Combine all filter groups with AND
            var oFinalFilter = aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : [];
            oBinding.filter(oFinalFilter);

            // Chronological Timestamp / Date comparator
            var oSorter = new Sorter(sSortField, bSortDescending, false, function (a, b) {
                if (sSortField === "submissionDate") {
                    var dA = a ? new Date(a).getTime() : 0;
                    var dB = b ? new Date(b).getTime() : 0;
                    return dA - dB;
                }
                var sA = (a || "").toString();
                var sB = (b || "").toString();
                return sA.localeCompare(sB);
            });
            oBinding.sort(oSorter);

            oViewModel.setProperty("/filteredCount", oBinding.getLength());
        },

        /**
         * Handler for IconTabBar tab selection.
         * @param {sap.ui.base.Event} oEvent
         */
        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/selectedTab", sKey);
            this._applyFiltersAndSorting();
        },

        /**
         * Handler for SearchField search and liveChange.
         * @param {sap.ui.base.Event} oEvent
         */
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery === undefined) {
                sQuery = oEvent.getParameter("newValue");
            }
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/searchQuery", sQuery || "");
            this._applyFiltersAndSorting();
        },

        /**
         * Opens ViewSettingsDialog fragment for column visibility, sorting and category filtering.
         */
        onOpenViewSettings: function () {
            var oView = this.getView();
            if (!this._pViewSettingsDialog) {
                this._pViewSettingsDialog = Fragment.load({
                    id: oView.getId(),
                    name: "codeup.supplier.approvals.view.fragment.ViewSettingsDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pViewSettingsDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        /**
         * Confirms ViewSettingsDialog selections.
         * @param {sap.ui.base.Event} oEvent
         */
        onConfirmViewSettings: function (oEvent) {
            var oViewModel = this.getView().getModel("viewModel");
            var mParams = oEvent.getParameters();

            // Sorter settings
            if (mParams.sortItem) {
                oViewModel.setProperty("/sortField", mParams.sortItem.getKey());
            }
            oViewModel.setProperty("/sortDescending", mParams.sortDescending);

            // Filter settings (category)
            var sSelectedCategory = "";
            if (mParams.filterItems && mParams.filterItems.length > 0) {
                sSelectedCategory = mParams.filterItems[0].getKey();
            }
            oViewModel.setProperty("/selectedCategory", sSelectedCategory);

            this._applyFiltersAndSorting();
        },

        /**
         * Resets ViewSettingsDialog filters.
         */
        onResetViewSettings: function () {
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/sortField", "submissionDate");
            oViewModel.setProperty("/sortDescending", true);
            oViewModel.setProperty("/selectedCategory", "");
            this._applyFiltersAndSorting();
        },

        /**
         * Clears all filters (tab, search, category) and resets to "all".
         */
        onClearFilters: function () {
            var oViewModel = this.getView().getModel("viewModel");
            var oBundle = this.getResourceBundle();

            oViewModel.setProperty("/selectedTab", "all");
            oViewModel.setProperty("/searchQuery", "");
            oViewModel.setProperty("/selectedCategory", "");
            oViewModel.setProperty("/sortField", "submissionDate");
            oViewModel.setProperty("/sortDescending", true);

            var oSearchField = this.byId("searchField");
            if (oSearchField) {
                oSearchField.setValue("");
            }

            var oTabBar = this.byId("iconTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey("all");
            }

            this._applyFiltersAndSorting();
            MessageToast.show(oBundle.getText("msgFilterReset"));
        },

        /**
         * Refreshes submission data from backend.
         */
        onRefresh: function () {
            this._loadSubmissions(true);
        }
    });
});
