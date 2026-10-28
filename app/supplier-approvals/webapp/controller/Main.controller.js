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

    var DEFAULT_COLUMNS = {
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
    };

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
                columns: JSON.parse(JSON.stringify(DEFAULT_COLUMNS))
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

            // Başvuruları backend'den yükler
            this._loadSubmissions();
        },

        // i18n dil paketine erişir
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        // Test veya BTP auth başlıklarını döner
        _getAuthHeaders: function () {
            var oHeaders = {
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest"
            };
            var sStoredAuth = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("codeup_approver_auth") : null;
            if (sStoredAuth) {
                oHeaders["Authorization"] = sStoredAuth;
            } else if (typeof window !== "undefined" && window.__APPROVAL_AUTH__) {
                oHeaders["Authorization"] = window.__APPROVAL_AUTH__;
            }
            return oHeaders;
        },

        // Başvuruları OData V4 servisinden yükler; yetki kontrolü yapar
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

                var sContentType = (oResponse.headers.get("content-type") || "").toLowerCase();

                // Oturum düşmüşse login uyarısı gösterir
                if (oResponse.status === 401 || (oResponse.ok && sContentType.includes("text/html"))) {
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

        // BTP Approuter login sayfasına yönlendirir
        onLoginWithBtpPress: function () {
            var sPort = window.location.port;
            if (sPort === "5001") {
                window.location.href = "http://" + window.location.hostname + ":5000/supplier-approvals/index.html";
            } else {
                window.location.href = "/supplier-approvals/index.html";
            }
        },

        // Başvuruları statülerine göre sayar
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

        // Tabloya sekme, kategori, arama ve sıralama filtrelerini uygular
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

            // 1. Durum filtresi (IconTabBar)
            if (sSelectedTab && sSelectedTab !== "all") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sSelectedTab));
            }

            // 2. Kategori filtresi
            if (sSelectedCategory) {
                aFilters.push(new Filter("category", FilterOperator.EQ, sSelectedCategory));
            }

            // 3. Çok alanlı metin arama filtresi
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

            // Filtreleri AND ile birleştirir
            if (aFilters.length === 0) {
                oBinding.filter([]);
            } else if (aFilters.length === 1) {
                oBinding.filter(aFilters[0]);
            } else {
                oBinding.filter(new Filter({ filters: aFilters, and: true }));
            }

            // Sıralama uygular
            oBinding.sort(new Sorter(sSortField, bSortDescending));

            oViewModel.setProperty("/filteredCount", oBinding.getLength());
        },

        // Sekme seçildiğinde filtreleri günceller
        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/selectedTab", sKey);
            this._applyFiltersAndSorting();
        },

        // Arama kutusuna yazıldığında filtreleri günceller
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery === undefined) {
                sQuery = oEvent.getParameter("newValue");
            }
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/searchQuery", sQuery || "");
            this._applyFiltersAndSorting();
        },

        // Sütun, sıralama ve kategori ayar diyaloğunu açar
        onOpenViewSettings: function () {
            var oView = this.getView();
            var oViewModel = oView.getModel("viewModel");
            
            var oColumnsCopy = JSON.parse(JSON.stringify(oViewModel.getProperty("/columns")));
            
            var oViewSettingsModel = oView.getModel("viewSettingsModel");
            if (!oViewSettingsModel) {
                oViewSettingsModel = new JSONModel(oColumnsCopy);
                oView.setModel(oViewSettingsModel, "viewSettingsModel");
            } else {
                oViewSettingsModel.setData(oColumnsCopy);
            }

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

        // Seçilen sütun, sıralama ve kategori ayarlarını uygular
        onConfirmViewSettings: function (oEvent) {
            var oView = this.getView();
            var oViewModel = oView.getModel("viewModel");
            var oViewSettingsModel = oView.getModel("viewSettingsModel");
            var mParams = oEvent.getParameters();

            if (oViewSettingsModel) {
                oViewModel.setProperty("/columns", oViewSettingsModel.getData());
            }

            if (mParams.sortItem) {
                oViewModel.setProperty("/sortField", mParams.sortItem.getKey());
            }
            oViewModel.setProperty("/sortDescending", mParams.sortDescending);

            var sSelectedCategory = "";
            if (mParams.filterItems && mParams.filterItems.length > 0) {
                sSelectedCategory = mParams.filterItems[0].getKey();
            }
            oViewModel.setProperty("/selectedCategory", sSelectedCategory);

            this._applyFiltersAndSorting();
        },

        // Sıralama ve kategori filtrelerini sıfırlar
        onResetViewSettings: function () {
            var oView = this.getView();
            var oViewModel = oView.getModel("viewModel");
            
            oViewModel.setProperty("/sortField", "submissionDate");
            oViewModel.setProperty("/sortDescending", true);
            oViewModel.setProperty("/selectedCategory", "");
            
            this._applyFiltersAndSorting();
        },

        // Tüm filtreleri temizler ve varsayılan görünüme döner
        onClearFilters: function () {
            var oView = this.getView();
            var oViewModel = oView.getModel("viewModel");
            var oBundle = this.getResourceBundle();

            oViewModel.setProperty("/selectedTab", "all");
            oViewModel.setProperty("/searchQuery", "");
            oViewModel.setProperty("/selectedCategory", "");
            oViewModel.setProperty("/sortField", "submissionDate");
            oViewModel.setProperty("/sortDescending", true);

            var oDefaultCols = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            oViewModel.setProperty("/columns", oDefaultCols);

            var oViewSettingsModel = oView.getModel("viewSettingsModel");
            if (oViewSettingsModel) {
                oViewSettingsModel.setData(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)));
            }

            var oSearchField = this.byId("searchField");
            if (oSearchField) {
                oSearchField.setValue("");
            }

            var oTabBar = this.byId("iconTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey("all");
            }

            if (this._pViewSettingsDialog) {
                this._pViewSettingsDialog.then(function (oDialog) {
                    if (oDialog) {
                        if (typeof oDialog.setSelectedFilterKeys === "function") {
                            oDialog.setSelectedFilterKeys({});
                        }
                        var aSortItems = typeof oDialog.getSortItems === "function" ? oDialog.getSortItems() : [];
                        if (aSortItems && aSortItems.length > 0 && typeof oDialog.setSelectedSortItem === "function") {
                            oDialog.setSelectedSortItem(aSortItems[0]);
                        }
                        if (typeof oDialog.setSortDescending === "function") {
                            oDialog.setSortDescending(true);
                        }
                    }
                });
            }

            this._applyFiltersAndSorting();
            MessageToast.show(oBundle.getText("msgFilterReset"));
        },

        // Verileri backend'den tazeler
        onRefresh: function () {
            this._loadSubmissions(true);
        },

        // Satıra tıklandığında detay diyaloğunu açar
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

        // Detay diyaloğunu açar ve başvuru/sertifika verilerini yükler
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
                // Güncel tekil kaydı çeker
                var oResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")", {
                    method: "GET",
                    headers: this._getAuthHeaders()
                });

                var sContentType = (oResponse.headers.get("content-type") || "").toLowerCase();
                if (oResponse.status === 401 || (oResponse.ok && sContentType.includes("text/html"))) {
                    MessageToast.show(oBundle.getText("msgAuthRequired"));
                    return;
                }

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

                // 3 aşamalı süreç akışını (ProcessFlow) kurar
                var oProcessFlow = this._buildProcessFlow(oSubmission.status, oSubmission, oBundle);
                oDetailModel.setProperty("/processFlow", oProcessFlow);

                setTimeout(function () {
                    var oPF = this.byId("detailProcessFlow");
                    if (oPF && typeof oPF.updateModel === "function") {
                        oPF.updateModel();
                    }
                }.bind(this), 0);

                var bHasCertName = !!(oSubmission.certificateFileName && oSubmission.certificateFileName.trim());
                oDetailModel.setProperty("/hasPdf", bHasCertName);

                // Sertifika ikili veri akışını (PDF) çekip önizleme için blob URL üretir
                var sDirectPdfUrl = "/odata/v4/approval/Submissions(" + sId + ")/certificate";
                oDetailModel.setProperty("/pdfDirectUrl", sDirectPdfUrl);

                var oCertHeaders = Object.assign({}, this._getAuthHeaders());
                delete oCertHeaders["Accept"];
                oCertHeaders["Accept"] = "*/*";

                try {
                    var oCertResponse = await fetch(sDirectPdfUrl, {
                        method: "GET",
                        headers: oCertHeaders
                    });

                    if (oCertResponse.ok) {
                        var oBlob = await oCertResponse.blob();
                        if (oBlob && oBlob.size > 0) {
                            var sBlobUrl = URL.createObjectURL(oBlob);
                            oDetailModel.setProperty("/pdfBlobUrl", sBlobUrl);
                            oDetailModel.setProperty("/pdfUrl", sBlobUrl);
                            oDetailModel.setProperty("/hasPdf", true);
                        } else {
                            oDetailModel.setProperty("/hasPdf", bHasCertName);
                        }
                    } else {
                        oDetailModel.setProperty("/hasPdf", bHasCertName);
                    }
                } catch (e) {
                    oDetailModel.setProperty("/hasPdf", bHasCertName);
                }
            } catch (oErr) {
                MessageToast.show(oBundle.getText("msgError") + " (" + oErr.message + ")");
            } finally {
                oDetailModel.setProperty("/busy", false);
            }
        },

        // Statüye göre ProcessFlow şerit ve düğümlerini dinamik oluşturur
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

        // PDF önizleme panelini açıp kapatır
        onTogglePdfPreview: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var bCurrent = oDetailModel.getProperty("/showPdfPreview");
            oDetailModel.setProperty("/showPdfPreview", !bCurrent);
        },

        // PDF sertifikasını yeni sekmede açar ve indirmeyi tetikler
        onOpenPdfInNewTab: async function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sUrl = oDetailModel.getProperty("/pdfBlobUrl");
            var sDirectUrl = oDetailModel.getProperty("/pdfDirectUrl");
            var sFileName = oDetailModel.getProperty("/certificateFileName") || "certificate.pdf";
            var sId = oDetailModel.getProperty("/ID");

            if (!sUrl && sId) {
                try {
                    var oCertHeaders = Object.assign({}, this._getAuthHeaders());
                    delete oCertHeaders["Accept"];
                    oCertHeaders["Accept"] = "*/*";
                    var oCertResponse = await fetch("/odata/v4/approval/Submissions(" + sId + ")/certificate", {
                        method: "GET",
                        headers: oCertHeaders
                    });
                    if (oCertResponse.ok) {
                        var oBlob = await oCertResponse.blob();
                        if (oBlob && oBlob.size > 0) {
                            sUrl = URL.createObjectURL(oBlob);
                            oDetailModel.setProperty("/pdfBlobUrl", sUrl);
                            oDetailModel.setProperty("/pdfUrl", sUrl);
                        }
                    }
                } catch (e) {
                    // Direct URL alternatifi kullanılır
                }
            }

            var sTargetUrl = sUrl || sDirectUrl;

            if (sTargetUrl && typeof window !== "undefined") {
                window.open(sTargetUrl, "_blank");

                if (sUrl && sUrl.startsWith("blob:")) {
                    try {
                        var oDownloadLink = document.createElement("a");
                        oDownloadLink.href = sUrl;
                        oDownloadLink.download = sFileName;
                        document.body.appendChild(oDownloadLink);
                        oDownloadLink.click();
                        document.body.removeChild(oDownloadLink);
                    } catch (err) {
                        // İndirme tetikleme hatası göz ardı edilir
                    }
                }
            }
        },

        // Detay diyaloğunu kapatır ve oluşturulan blob URL belleğini temizler
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

        // Başvuruyu onaylar (CAP ApprovalService bound action)
        onApprovePress: function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sId = oDetailModel.getProperty("/ID");
            var sCompany = oDetailModel.getProperty("/companyName") || "";
            var oBundle = this.getResourceBundle();

            if (!sId) {
                return;
            }

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

                            // Tekil kaydı ve tablo listesini günceller
                            await this._reloadSubmission(sId);
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

        // Tekil başvuruyu backend'den yeniler ve UI akışını günceller
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

                oDetailModel.setProperty("/status", oSubmission.status);
                oDetailModel.setProperty("/rejectionReason", oSubmission.rejectionReason || "");
                oDetailModel.setProperty("/editableFields", oSubmission.editableFields || "");

                var oProcessFlow = this._buildProcessFlow(oSubmission.status, oSubmission, oBundle);
                oDetailModel.setProperty("/processFlow", oProcessFlow);

                setTimeout(function () {
                    var oPF = this.byId("detailProcessFlow");
                    if (oPF && typeof oPF.updateModel === "function") {
                        oPF.updateModel();
                    }
                }.bind(this), 0);
            } catch (e) {
                // Arka plan yenileme hataları göz ardı edilir
            }
        },

        // Reddetme diyaloğunu açar; varsa AI önerisini forma aktarır
        onRejectPress: async function () {
            var oView = this.getView();
            var oDetailModel = oView.getModel("detailModel");
            var oRejectModel = oView.getModel("rejectModel");
            var sId = oDetailModel.getProperty("/ID");
            var sCompany = oDetailModel.getProperty("/companyName") || "";

            if (!sId) {
                return;
            }

            // AI red önerdiyse gerekçe ve alan seçimini otomatik doldurur
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

        // Ret gerekçesi değiştiğinde formu doğrular
        onRejectReasonLiveChange: function () {
            this._validateRejectForm();
        },

        // Düzeltilecek alan seçimi değiştiğinde formu doğrular
        onRejectFieldSelect: function () {
            this._validateRejectForm();
        },

        // Sadece sertifika alanını seçer
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

        // Seçilen tüm alanları temizler
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

        // Ret gerekçesi ve alan seçiminin doluluğunu denetler
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

        // Reddetme işlemini backend'e iletir (CAP ApprovalService bound action)
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

                this.onCloseRejectDialog();
                await this._reloadSubmission(sId);
                await this._loadSubmissions();

                MessageToast.show(oBundle.getText("msgRejectSuccess"));
            } catch (oErr) {
                MessageBox.error(oBundle.getText("errRejectFailed") + " (" + oErr.message + ")");
            } finally {
                oRejectModel.setProperty("/busy", false);
                oDetailModel.setProperty("/actionBusy", false);
            }
        },

        // Reddetme diyaloğunu kapatır
        onCloseRejectDialog: function () {
            if (this._pRejectDialog) {
                this._pRejectDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        // Yapay zeka ile sertifika analizi yapar (CAP analyzeCertificate action)
        onAnalyzeCertificate: async function () {
            var oDetailModel = this.getView().getModel("detailModel");
            var sId = oDetailModel.getProperty("/ID");
            var oBundle = this.getResourceBundle();

            if (!sId) {
                return;
            }

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

                var sValidityStatus = (oAiData && oAiData.validityStatus) ? oAiData.validityStatus : "Invalid";
                var sRecommendation = (oAiData && oAiData.recommendation)
                    ? String(oAiData.recommendation)
                    : (sValidityStatus === "Valid" ? "Öneri: Onayla" : "Öneri: Reddet");

                oDetailModel.setProperty("/aiReport", {
                    validityStatus: sValidityStatus,
                    recommendation: sRecommendation,
                    reason: (oAiData && oAiData.reason) ? String(oAiData.reason) : "",
                    suggestedFields: (oAiData && oAiData.suggestedFields) ? String(oAiData.suggestedFields) : "",
                    analyzedAt: (oAiData && oAiData.analyzedAt) ? String(oAiData.analyzedAt) : new Date().toISOString(),
                    fileName: (oAiData && oAiData.fileName) || oDetailModel.getProperty("/certificateFileName") || "certificate.pdf"
                });
                oDetailModel.setProperty("/hasAiReport", true);

                MessageToast.show(oBundle.getText("msgAiAnalysisSuccess"));
            } catch (oErr) {
                oDetailModel.setProperty("/hasAiReport", false);
                var sErrorMsg = oErr && oErr.message ? oErr.message : "";
                if (sErrorMsg.includes("is of type") || sErrorMsg.includes("expected boolean")) {
                    MessageBox.error(oBundle.getText("msgError") + " (" + sErrorMsg + ")");
                } else {
                    MessageBox.error(oBundle.getText("errAiDestinationFailed") + (sErrorMsg ? " (" + sErrorMsg + ")" : ""));
                }
            } finally {
                oDetailModel.setProperty("/aiBusy", false);
            }
        }
    });
});
