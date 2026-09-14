sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "codeup/supplier/approvals/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, MessageBox, Fragment, formatter) {
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

            var oDetailModel = new JSONModel({
                busy: false,
                actionBusy: false,
                aiBusy: false,
                hasAiReport: false,
                aiReport: {
                    validityStatus: "",
                    recommendation: "",
                    reason: "",
                    suggestedFields: "",
                    analyzedAt: "",
                    fileName: ""
                },
                ID: "",
                companyName: "",
                contactPerson: "",
                supplierEmail: "",
                phone: "",
                country: "",
                category: "",
                taxId: "",
                website: "",
                address: "",
                notes: "",
                submissionDate: "",
                status: "",
                rejectionReason: "",
                editableFields: "",
                certificateFileName: "",
                certificateMimeType: "",
                hasPdf: false,
                showPdfPreview: false,
                pdfUrl: "",
                pdfBlobUrl: "",
                processFlow: {
                    lanes: [],
                    nodes: []
                }
            });
            this.getView().setModel(oDetailModel, "detailModel");

            var oRejectModel = new JSONModel({
                busy: false,
                submissionId: "",
                companyName: "",
                reason: "",
                fields: {
                    companyName: false,
                    contactPerson: false,
                    phone: false,
                    country: false,
                    taxId: false,
                    website: false,
                    address: false,
                    notes: false,
                    category: false,
                    certificate: false
                },
                canSubmit: false
            });
            this.getView().setModel(oRejectModel, "rejectModel");

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
         * Reads auth headers if provided in local development or test environment.
         * @returns {Object} Headers map
         */
        _getAuthHeaders: function () {
            var oHeaders = {
                "Accept": "application/json"
            };
            var sStoredAuth = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("codeup_approver_auth") : null;
            if (sStoredAuth) {
                oHeaders["Authorization"] = sStoredAuth;
            } else if (typeof window !== "undefined" && window.__APPROVAL_AUTH__) {
                oHeaders["Authorization"] = window.__APPROVAL_AUTH__;
            }
            return oHeaders;
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
                var oResponse = await fetch("/odata/v4/approval/Submissions", {
                    method: "GET",
                    headers: this._getAuthHeaders()
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
        },

        // =================================================================
        // FAZ 6 — ADIM 6.3: DETAY DİYALOĞU VE PDF ÖNİZLEME YÖNETİMİ
        // =================================================================

        /**
         * Handles table row press to open Detail Dialog.
         * @param {sap.ui.base.Event} oEvent
         */
        onRowPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oCtx = oItem.getBindingContext("submissions");
            if (!oCtx) {
                return;
            }
            var oSubmission = oCtx.getObject();
            if (oSubmission && oSubmission.ID) {
                this._openDetailDialog(oSubmission.ID);
            }
        },

        /**
         * Opens the detail dialog and loads the submission details and certificate stream from backend.
         * @param {string} sId Submission UUID
         */
        _openDetailDialog: async function (sId) {
            var oView = this.getView();
            var oDetailModel = oView.getModel("detailModel");
            var oBundle = this.getResourceBundle();

            oDetailModel.setProperty("/busy", true);
            oDetailModel.setProperty("/showPdfPreview", false);
            oDetailModel.setProperty("/hasAiReport", false);
            oDetailModel.setProperty("/aiReport", {
                validityStatus: "",
                recommendation: "",
                reason: "",
                suggestedFields: "",
                analyzedAt: "",
                fileName: ""
            });
            oDetailModel.setProperty("/aiBusy", false);

            if (!this._pDetailDialog) {
                this._pDetailDialog = Fragment.load({
                    id: oView.getId(),
                    name: "codeup.supplier.approvals.view.fragment.DetailDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            var oDialog = await this._pDetailDialog;
            oDialog.open();

            try {
                // Fetch latest single record from backend
                var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")", {
                    method: "GET",
                    headers: this._getAuthHeaders()
                });

                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }

                var oSubmission = await oResponse.json();

                oDetailModel.setProperty("/ID", oSubmission.ID);
                oDetailModel.setProperty("/companyName", oSubmission.companyName);
                oDetailModel.setProperty("/contactPerson", oSubmission.contactPerson);
                oDetailModel.setProperty("/supplierEmail", oSubmission.supplierEmail);
                oDetailModel.setProperty("/phone", oSubmission.phone);
                oDetailModel.setProperty("/country", oSubmission.country);
                oDetailModel.setProperty("/category", oSubmission.category);
                oDetailModel.setProperty("/taxId", oSubmission.taxId);
                oDetailModel.setProperty("/website", oSubmission.website);
                oDetailModel.setProperty("/address", oSubmission.address);
                oDetailModel.setProperty("/notes", oSubmission.notes);
                oDetailModel.setProperty("/submissionDate", oSubmission.submissionDate);
                oDetailModel.setProperty("/status", oSubmission.status);
                oDetailModel.setProperty("/rejectionReason", oSubmission.rejectionReason || "");
                oDetailModel.setProperty("/editableFields", oSubmission.editableFields || "");
                oDetailModel.setProperty("/certificateFileName", oSubmission.certificateFileName || "");
                oDetailModel.setProperty("/certificateMimeType", oSubmission.certificateMimeType || "application/pdf");

                // Build 3-stage ProcessFlow model
                var oProcessFlow = this._buildProcessFlow(oSubmission.status, oSubmission, oBundle);
                oDetailModel.setProperty("/processFlow", oProcessFlow);

                setTimeout(function () {
                    var oPF = this.byId("detailProcessFlow");
                    if (oPF && typeof oPF.updateModel === "function") {
                        oPF.updateModel();
                    }
                }.bind(this), 0);

                // Fetch real certificate binary stream for inline preview
                var sDirectPdfUrl = "/odata/v4/approval/Submissions(" + sId + ")/certificate";
                oDetailModel.setProperty("/pdfDirectUrl", sDirectPdfUrl);

                var oCertResponse = await fetch(sDirectPdfUrl, {
                    method: "GET",
                    headers: this._getAuthHeaders()
                });

                if (oCertResponse.ok) {
                    var oBlob = await oCertResponse.blob();
                    if (oBlob && oBlob.size > 0) {
                        var sBlobUrl = URL.createObjectURL(oBlob);
                        oDetailModel.setProperty("/pdfBlobUrl", sBlobUrl);
                        oDetailModel.setProperty("/pdfUrl", sBlobUrl);
                        oDetailModel.setProperty("/hasPdf", true);
                    } else {
                        oDetailModel.setProperty("/hasPdf", false);
                    }
                } else {
                    oDetailModel.setProperty("/hasPdf", false);
                }
            } catch (oErr) {
                MessageToast.show(oBundle.getText("msgError") + " (" + oErr.message + ")");
            } finally {
                oDetailModel.setProperty("/busy", false);
            }
        },

        /**
         * Builds 3-stage ProcessFlow model for the detail view.
         * @param {string} sStatus Submission status
         * @param {Object} oSubmission Submission data
         * @param {Object} oBundle Resource bundle
         * @returns {Object} lanes and nodes
         */
        _buildProcessFlow: function (sStatus, oSubmission, oBundle) {
            var aLanes = [
                {
                    id: "lane-0",
                    icon: "sap-icon://request",
                    label: oBundle.getText("processStepSubmitted"),
                    position: 0,
                    state: [{ state: "Positive", value: 1 }]
                },
                {
                    id: "lane-1",
                    icon: "sap-icon://inspection",
                    label: oBundle.getText("processStepReview"),
                    position: 1,
                    state: [{
                        state: sStatus === "Pending" ? "Planned" : (sStatus === "InReview" ? "Neutral" : "Positive"),
                        value: 1
                    }]
                },
                {
                    id: "lane-2",
                    icon: "sap-icon://complete",
                    label: oBundle.getText("processStepDecision"),
                    position: 2,
                    state: [{
                        state: sStatus === "Approved" ? "Positive" : (sStatus === "Rejected" ? "Negative" : "Planned"),
                        value: 1
                    }]
                }
            ];

            var oNode1 = {
                id: "node-1",
                lane: "lane-0",
                title: oBundle.getText("processStepSubmitted"),
                titleAbbreviation: "1",
                state: "Positive",
                stateText: oBundle.getText("processStepSubmitted"),
                texts: [oBundle.getText("processStepSubmittedDesc")],
                children: ["node-2"],
                highlighted: sStatus === "Pending"
            };

            var sNode2State = "Planned";
            var sNode2StateText = oBundle.getText("processStepReview");
            var bNode2Highlighted = false;

            if (sStatus === "InReview") {
                sNode2State = "Neutral";
                sNode2StateText = oBundle.getText("statusInReview");
                bNode2Highlighted = true;
            } else if (sStatus === "Approved" || sStatus === "Rejected") {
                sNode2State = "Positive";
                sNode2StateText = oBundle.getText("statusInReview");
                bNode2Highlighted = false;
            }

            var oNode2 = {
                id: "node-2",
                lane: "lane-1",
                title: oBundle.getText("processStepReview"),
                titleAbbreviation: "2",
                state: sNode2State,
                stateText: sNode2StateText,
                texts: [oBundle.getText("processStepReviewDesc")],
                children: ["node-3"],
                highlighted: bNode2Highlighted
            };

            var sNode3Title = oBundle.getText("processStepDecision");
            var sNode3State = "Planned";
            var sNode3StateText = oBundle.getText("processStepDecision");
            var aNode3Texts = [oBundle.getText("processStepDecisionDesc")];
            var bNode3Highlighted = false;

            if (sStatus === "Approved") {
                sNode3Title = oBundle.getText("statusApproved");
                sNode3State = "Positive";
                sNode3StateText = oBundle.getText("statusApproved");
                aNode3Texts = [oBundle.getText("statusNoticeApproved")];
                bNode3Highlighted = true;
            } else if (sStatus === "Rejected") {
                sNode3Title = oBundle.getText("statusRejected");
                sNode3State = "Negative";
                sNode3StateText = oBundle.getText("statusRejected");
                aNode3Texts = oSubmission && oSubmission.rejectionReason ? [oSubmission.rejectionReason] : [oBundle.getText("statusNoticeRejected")];
                bNode3Highlighted = true;
            }

            var oNode3 = {
                id: "node-3",
                lane: "lane-2",
                title: sNode3Title,
                titleAbbreviation: "3",
                state: sNode3State,
                stateText: sNode3StateText,
                texts: aNode3Texts,
                children: [],
                highlighted: bNode3Highlighted
            };

            return {
                lanes: aLanes,
                nodes: [oNode1, oNode2, oNode3]
            };
        },

        /**
         * Toggles the inline PDF preview viewer visibility.
         */
        onTogglePdfPreview: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var bCurrent = oDetailModel.getProperty("/showPdfPreview");
            oDetailModel.setProperty("/showPdfPreview", !bCurrent);
        },

        /**
         * Opens the certificate PDF stream in a new browser tab.
         */
        onOpenPdfInNewTab: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sUrl = oDetailModel.getProperty("/pdfBlobUrl") || oDetailModel.getProperty("/pdfDirectUrl");
            if (sUrl && typeof window !== "undefined") {
                window.open(sUrl, "_blank");
            }
        },

        /**
         * Closes the Detail Dialog and frees up memory from any created blob URL.
         */
        onCloseDetailDialog: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sBlobUrl = oDetailModel.getProperty("/pdfBlobUrl");
            if (sBlobUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
                URL.revokeObjectURL(sBlobUrl);
                oDetailModel.setProperty("/pdfBlobUrl", "");
            }
            if (this._pDetailDialog) {
                this._pDetailDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        /**
         * Handles manual approval of the supplier submission via real CAP ApprovalService.
         * Prompts the approver with a confirmation dialog, prevents duplicate submissions,
         * calls the real bound action Submissions(ID)/approve, and refreshes the UI strictly
         * based on the real backend response.
         */
        onApprovePress: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sId = oDetailModel.getProperty("/ID");
            var sCompany = oDetailModel.getProperty("/companyName") || "";
            var oBundle = this.getResourceBundle();

            if (!sId) {
                return;
            }

            // Prevent duplicate clicks while an action is already in progress
            if (oDetailModel.getProperty("/actionBusy")) {
                return;
            }

            var sConfirmMessage = sCompany
                ? oBundle.getText("msgApproveConfirm") + " (" + sCompany + ")"
                : oBundle.getText("msgApproveConfirm");

            MessageBox.confirm(sConfirmMessage, {
                title: oBundle.getText("msgApproveConfirmTitle"),
                icon: MessageBox.Icon.QUESTION,
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                onClose: async function (sAction) {
                    if (sAction === MessageBox.Action.YES) {
                        oDetailModel.setProperty("/actionBusy", true);
                        try {
                            var oHeaders = Object.assign({
                                "Content-Type": "application/json"
                            }, this._getAuthHeaders());

                            // Call real CAP ApprovalService bound action
                            var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")/approve", {
                                method: "POST",
                                headers: oHeaders,
                                body: "{}"
                            });

                            if (!oResponse.ok) {
                                var oErrorData = await oResponse.json().catch(function () { return null; });
                                var sBackendMsg = (oErrorData && oErrorData.error && oErrorData.error.message)
                                    ? oErrorData.error.message
                                    : oBundle.getText("errApproveFailed");
                                MessageBox.error(sBackendMsg);
                                return;
                            }

                            // Reload submission directly from backend to guarantee truth in UI
                            await this._reloadSubmission(sId);

                            // Refresh table list & counts in main view
                            await this._loadSubmissions();

                            MessageToast.show(oBundle.getText("msgApproveSuccess"));
                        } catch (oErr) {
                            MessageBox.error(oBundle.getText("errApproveFailed") + " (" + oErr.message + ")");
                        } finally {
                            oDetailModel.setProperty("/actionBusy", false);
                        }
                    }
                }.bind(this)
            });
        },

        /**
         * Reloads a single submission record from real backend and updates ProcessFlow and UI models.
         * @param {string} sId Submission UUID
         */
        _reloadSubmission: async function (sId) {
            var oDetailModel = this.getView().getModel("detailModel");
            var oBundle = this.getResourceBundle();

            try {
                var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")", {
                    method: "GET",
                    headers: this._getAuthHeaders()
                });

                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }

                var oSubmission = await oResponse.json();

                // Strictly update from real backend response
                oDetailModel.setProperty("/status", oSubmission.status);
                oDetailModel.setProperty("/rejectionReason", oSubmission.rejectionReason || "");
                oDetailModel.setProperty("/editableFields", oSubmission.editableFields || "");

                // Re-evaluate 3-stage ProcessFlow
                var oProcessFlow = this._buildProcessFlow(oSubmission.status, oSubmission, oBundle);
                oDetailModel.setProperty("/processFlow", oProcessFlow);

                setTimeout(function () {
                    var oPF = this.byId("detailProcessFlow");
                    if (oPF && typeof oPF.updateModel === "function") {
                        oPF.updateModel();
                    }
                }.bind(this), 0);
            } catch (e) {
                // Ignore network errors on background reload
            }
        },

        /**
         * Opens the rejection dialog and resets the rejectModel with empty fields,
         * or pre-populates with AI rejection suggestion if available.
         */
        onRejectPress: async function () {
            var oView = this.getView();
            var oDetailModel = oView.getModel("detailModel");
            var oRejectModel = oView.getModel("rejectModel");
            var sId = oDetailModel.getProperty("/ID");
            var sCompany = oDetailModel.getProperty("/companyName") || "";

            if (!sId) {
                return;
            }

            // If AI recommended rejection, pre-populate the reason and pre-select certificate
            var bAiRejection = oDetailModel.getProperty("/hasAiReport") &&
                (oDetailModel.getProperty("/aiReport/validityStatus") !== "Valid" ||
                 (oDetailModel.getProperty("/aiReport/recommendation") || "").indexOf("Reddet") !== -1);

            var sInitialReason = bAiRejection ? (oDetailModel.getProperty("/aiReport/reason") || "") : "";
            var sSuggested = (oDetailModel.getProperty("/aiReport/suggestedFields") || "").toLowerCase();
            var bCertPreselected = bAiRejection || sSuggested.indexOf("certificate") !== -1;

            oRejectModel.setData({
                busy: false,
                submissionId: sId,
                companyName: sCompany,
                reason: sInitialReason,
                fields: {
                    companyName: false,
                    contactPerson: false,
                    phone: false,
                    country: false,
                    taxId: false,
                    website: false,
                    address: false,
                    notes: false,
                    category: false,
                    certificate: bCertPreselected
                },
                canSubmit: false
            });

            this._validateRejectForm();

            if (!this._pRejectDialog) {
                this._pRejectDialog = Fragment.load({
                    id: oView.getId(),
                    name: "codeup.supplier.approvals.view.fragment.RejectDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            var oDialog = await this._pRejectDialog;
            oDialog.open();
        },

        /**
         * Live change listener for the rejection reason text area.
         */
        onRejectReasonLiveChange: function () {
            this._validateRejectForm();
        },

        /**
         * Selection change listener for editable fields checkboxes.
         */
        onRejectFieldSelect: function () {
            this._validateRejectForm();
        },

        /**
         * Selects only the certificate field and unchecks all others.
         */
        onSelectCertOnly: function () {
            var oRejectModel = this.getView().getModel("rejectModel");
            oRejectModel.setProperty("/fields", {
                companyName: false,
                contactPerson: false,
                phone: false,
                country: false,
                taxId: false,
                website: false,
                address: false,
                notes: false,
                category: false,
                certificate: true
            });
            this._validateRejectForm();
        },

        /**
         * Unchecks all editable fields.
         */
        onClearAllFields: function () {
            var oRejectModel = this.getView().getModel("rejectModel");
            oRejectModel.setProperty("/fields", {
                companyName: false,
                contactPerson: false,
                phone: false,
                country: false,
                taxId: false,
                website: false,
                address: false,
                notes: false,
                category: false,
                certificate: false
            });
            this._validateRejectForm();
        },

        /**
         * Validates the rejection form: reason must not be whitespace-only,
         * and at least one editable field must be selected.
         * @returns {boolean} Whether the form is valid to submit
         */
        _validateRejectForm: function () {
            var oRejectModel = this.getView().getModel("rejectModel");
            if (!oRejectModel) {
                return false;
            }

            var sReason = (oRejectModel.getProperty("/reason") || "").trim();
            var oFields = oRejectModel.getProperty("/fields") || {};
            var bHasField = Object.keys(oFields).some(function (k) {
                return oFields[k] === true;
            });

            var bCanSubmit = sReason.length > 0 && bHasField;
            oRejectModel.setProperty("/canSubmit", bCanSubmit);
            return bCanSubmit;
        },

        /**
         * Submits the rejection to the real CAP ApprovalService bound action.
         */
        onConfirmReject: async function () {
            var oBundle = this.getResourceBundle();
            var oRejectModel = this.getView().getModel("rejectModel");
            var oDetailModel = this.getView().getModel("detailModel");
            var sId = oRejectModel.getProperty("/submissionId");

            if (oRejectModel.getProperty("/busy") || oDetailModel.getProperty("/actionBusy")) {
                return;
            }

            var sReason = (oRejectModel.getProperty("/reason") || "").trim();
            if (!sReason) {
                MessageBox.warning(oBundle.getText("errRejectReasonRequired"));
                return;
            }

            var oFields = oRejectModel.getProperty("/fields") || {};
            var aValidWhitelist = [
                "companyName", "contactPerson", "phone", "country",
                "taxId", "website", "address", "notes", "category", "certificate"
            ];
            var aSelected = [];
            aValidWhitelist.forEach(function (k) {
                if (oFields[k] === true) {
                    aSelected.push(k);
                }
            });

            if (aSelected.length === 0) {
                MessageBox.warning(oBundle.getText("errEditableFieldsRequired"));
                return;
            }

            var sEditableFields = aSelected.join(",");

            oRejectModel.setProperty("/busy", true);
            oDetailModel.setProperty("/actionBusy", true);

            try {
                var oHeaders = Object.assign({
                    "Content-Type": "application/json"
                }, this._getAuthHeaders());

                // Call real CAP ApprovalService bound reject action
                var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")/reject", {
                    method: "POST",
                    headers: oHeaders,
                    body: JSON.stringify({
                        rejectionReason: sReason,
                        editableFields: sEditableFields
                    })
                });

                if (!oResponse.ok) {
                    var oErrorData = await oResponse.json().catch(function () { return null; });
                    var sBackendMsg = (oErrorData && oErrorData.error && oErrorData.error.message)
                        ? oErrorData.error.message
                        : oBundle.getText("errRejectFailed");
                    MessageBox.error(sBackendMsg);
                    return;
                }

                // Close reject dialog
                this.onCloseRejectDialog();

                // Reload submission directly from backend to guarantee truth in UI
                await this._reloadSubmission(sId);

                // Refresh table list & counts in main view
                await this._loadSubmissions();

                MessageToast.show(oBundle.getText("msgRejectSuccess"));
            } catch (oErr) {
                MessageBox.error(oBundle.getText("errRejectFailed") + " (" + oErr.message + ")");
            } finally {
                oRejectModel.setProperty("/busy", false);
                oDetailModel.setProperty("/actionBusy", false);
            }
        },

        /**
         * Closes the reject dialog.
         */
        onCloseRejectDialog: function () {
            if (this._pRejectDialog) {
                this._pRejectDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        /**
         * Triggers AI certificate analysis on the real CAP ApprovalService bound action.
         * Displays decision support report without mutating the submission status.
         */
        onAnalyzeCertificate: async function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sId = oDetailModel.getProperty("/ID");
            var oBundle = this.getResourceBundle();

            if (!sId) {
                return;
            }

            // Prevent concurrent/duplicate clicks
            if (oDetailModel.getProperty("/aiBusy")) {
                return;
            }

            if (!oDetailModel.getProperty("/hasPdf")) {
                MessageBox.warning(oBundle.getText("errAiNoCertificate"));
                return;
            }

            oDetailModel.setProperty("/aiBusy", true);
            MessageToast.show(oBundle.getText("aiAnalyzing"));

            try {
                var oHeaders = Object.assign({
                    "Content-Type": "application/json"
                }, this._getAuthHeaders());

                // Call real CAP ApprovalService bound action
                var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")/analyzeCertificate", {
                    method: "POST",
                    headers: oHeaders,
                    body: "{}"
                });

                if (!oResponse.ok) {
                    var oErrorData = await oResponse.json().catch(function () { return null; });
                    var sBackendMsg = (oErrorData && oErrorData.error && oErrorData.error.message)
                        ? oErrorData.error.message
                        : oBundle.getText("errAiDestinationFailed");
                    oDetailModel.setProperty("/hasAiReport", false);
                    MessageBox.error(sBackendMsg);
                    return;
                }

                var oReport = await oResponse.json();
                var oAiData = oReport && oReport.value ? oReport.value : oReport;

                // Bind strictly to backend AIReport fields
                oDetailModel.setProperty("/aiReport", {
                    validityStatus: oAiData.validityStatus || "Invalid",
                    recommendation: oAiData.recommendation || "",
                    reason: oAiData.reason || "",
                    suggestedFields: oAiData.suggestedFields || "",
                    analyzedAt: oAiData.analyzedAt || new Date().toISOString(),
                    fileName: oAiData.fileName || oDetailModel.getProperty("/certificateFileName") || "certificate.pdf"
                });
                oDetailModel.setProperty("/hasAiReport", true);

                MessageToast.show(oBundle.getText("msgAiAnalysisSuccess"));
            } catch (oErr) {
                oDetailModel.setProperty("/hasAiReport", false);
                MessageBox.error(oBundle.getText("errAiDestinationFailed") + " (" + oErr.message + ")");
            } finally {
                oDetailModel.setProperty("/aiBusy", false);
            }
        }
    });
});
