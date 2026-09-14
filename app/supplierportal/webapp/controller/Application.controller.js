sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "codeup/supplier/portal/model/AuthManager",
  "codeup/supplier/portal/model/ThemeManager"
], function (Controller, JSONModel, MessageToast, AuthManager, ThemeManager) {
  "use strict";

  var SERVICE_BASE = "/odata/v4/public";
  var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  return Controller.extend("codeup.supplier.portal.controller.Application", {
    onInit: function () {
      var oViewModel = new JSONModel({
        supplierEmail: "",
        supplierId: "",
        isAuthenticated: false,
        hasExistingSubmission: false,
        existingSubmission: null,
        processFlow: {
          lanes: [],
          nodes: []
        },
        isReApplyMode: false,
        reApplyEditableLabels: "",
        editableFields: {
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
        reApplyFormData: {
          companyName: "",
          contactPerson: "",
          phone: "",
          country: "",
          taxId: "",
          website: "",
          address: "",
          notes: "",
          category: ""
        },
        reApplyCertificate: {
          hasFile: false,
          fileName: "",
          fileSize: 0,
          fileSizeFormatted: "",
          base64: "",
          isValid: false,
          statusState: "None",
          statusIcon: "sap-icon://document-text"
        },
        isBusy: false,
        hasError: false,
        errorMessage: "",
        hasSuccess: false,
        successMessage: "",
        formData: {
          companyName: "",
          contactPerson: "",
          phone: "",
          country: "",
          taxId: "",
          website: "",
          address: "",
          notes: "",
          category: ""
        },
        certificate: {
          hasFile: false,
          fileName: "",
          fileSize: 0,
          fileSizeFormatted: "",
          base64: "",
          isValid: false,
          statusState: "None",
          statusIcon: "sap-icon://document-text"
        }
      });
      this.getView().setModel(oViewModel, "appView");

      var oRouter = this.getOwnerComponent().getRouter();
      if (oRouter) {
        oRouter.getRoute("application").attachPatternMatched(this._onPatternMatched, this);
      }
    },

    _onPatternMatched: function () {
      if (!AuthManager.isAuthenticated()) {
        this._navToAuth();
        return;
      }

      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/supplierEmail", AuthManager.getEmail());
      oModel.setProperty("/supplierId", AuthManager.getSupplierId());
      oModel.setProperty("/isAuthenticated", true);
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);

      this._loadExistingSubmission();
    },

    _loadExistingSubmission: async function () {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      try {
        var response = await fetch(SERVICE_BASE + "/getMySubmission()", {
          method: "GET",
          headers: AuthManager.getAuthHeaders()
        });

        if (response.status === 200) {
          var data = await response.json();
          var submission = data.value || data;
          if (submission && submission.ID) {
            var statusMeta = this._mapStatusMetadata(submission.status, oBundle);
            submission.statusText = statusMeta.text;
            submission.statusState = statusMeta.state;
            submission.statusIcon = statusMeta.icon;
            submission.statusNotice = statusMeta.notice;
            submission.noticeType = statusMeta.noticeType;
            if (submission.createdAt) {
              try {
                submission.submissionDate = new Date(submission.createdAt).toLocaleDateString();
              } catch (e) {
                submission.submissionDate = submission.createdAt;
              }
            } else {
              submission.submissionDate = "-";
            }

            var oProcessFlowData = this._buildProcessFlow(submission.status, submission, oBundle);
            oModel.setProperty("/processFlow", oProcessFlowData);
            oModel.setProperty("/existingSubmission", submission);
            oModel.setProperty("/hasExistingSubmission", true);

            setTimeout(function () {
              var oPF = this.byId("processFlow");
              if (oPF && typeof oPF.updateModel === "function") {
                oPF.updateModel();
              }
            }.bind(this), 0);

            return;
          }
        }

        // Başvuru yok (204 No Content veya boş)
        oModel.setProperty("/hasExistingSubmission", false);
        oModel.setProperty("/existingSubmission", null);
        oModel.setProperty("/processFlow", { lanes: [], nodes: [] });
      } catch (err) {
        // Ağ hatası veya backend hatası
        oModel.setProperty("/hasExistingSubmission", false);
        oModel.setProperty("/existingSubmission", null);
        oModel.setProperty("/processFlow", { lanes: [], nodes: [] });
      }
    },

    _mapStatusMetadata: function (sStatus, oBundle) {
      switch (sStatus) {
        case "Pending":
          return {
            text: oBundle.getText("statusPending"),
            state: "Warning",
            icon: "sap-icon://pending",
            notice: oBundle.getText("statusNoticePending"),
            noticeType: "Information"
          };
        case "InReview":
          return {
            text: oBundle.getText("statusInReview"),
            state: "Information",
            icon: "sap-icon://in-progress",
            notice: oBundle.getText("statusNoticeInReview"),
            noticeType: "Information"
          };
        case "Approved":
          return {
            text: oBundle.getText("statusApproved"),
            state: "Success",
            icon: "sap-icon://accept",
            notice: oBundle.getText("statusNoticeApproved"),
            noticeType: "Success"
          };
        case "Rejected":
          return {
            text: oBundle.getText("statusRejected"),
            state: "Error",
            icon: "sap-icon://decline",
            notice: oBundle.getText("statusNoticeRejected"),
            noticeType: "Error"
          };
        default:
          return {
            text: sStatus || "",
            state: "None",
            icon: "sap-icon://status-inactive",
            notice: "",
            noticeType: "None"
          };
      }
    },

    _buildProcessFlow: function (sStatus, oSubmission, oBundle) {
      // 3 Aşamalı Süreç Şeritleri (Lanes: Gönderildi -> İncelemede -> Sonuç)
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
            state: (sStatus === "Approved" ? "Positive" : (sStatus === "Rejected" ? "Negative" : "Planned")),
            value: 1
          }]
        }
      ];

      // Düğüm 1: Başvuru Gönderildi (Her zaman Positive)
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

      // Düğüm 2: İncelemede
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

      // Düğüm 3: Sonuç / Karar
      var sNode3Title = oBundle.getText("processStepDecision");
      var sNode3State = "Planned";
      var sNode3StateText = oBundle.getText("processStepDecision");
      var aNode3Texts = [oBundle.getText("processStepDecisionDesc")];
      var bNode3Highlighted = false;

      if (sStatus === "Approved") {
        sNode3Title = oBundle.getText("processStepApproved");
        sNode3State = "Positive";
        sNode3StateText = oBundle.getText("statusApproved");
        aNode3Texts = [oBundle.getText("processStepApprovedDesc")];
        bNode3Highlighted = true;
      } else if (sStatus === "Rejected") {
        sNode3Title = oBundle.getText("processStepRejected");
        sNode3State = "Negative";
        sNode3StateText = oBundle.getText("statusRejected");
        var sRejectionDesc = (oSubmission && oSubmission.rejectionReason)
          ? (oBundle.getText("rejectionReasonNotice") + " " + oSubmission.rejectionReason)
          : oBundle.getText("processStepRejectedDesc");
        aNode3Texts = [sRejectionDesc];
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

    onRefreshStatus: async function () {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      await this._loadExistingSubmission();
      MessageToast.show(oBundle.getText("btnRefreshProcessFlow"));
    },

    onInputChange: function () {
      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/hasError", false);
    },

    onErrorStripClose: function () {
      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/hasError", false);
    },

    onFileChange: function (oEvent) {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var oUploader = this.byId("fileUploader");

      oModel.setProperty("/hasError", false);

      var aFiles = oEvent.getParameter("files");
      if (!aFiles || aFiles.length === 0) {
        this._clearCertificate();
        return;
      }

      var oFile = aFiles[0];

      // 1. Format Kontrolü (PDF uzantısı)
      var sFileName = oFile.name || "";
      if (!sFileName.toLowerCase().endsWith(".pdf")) {
        oUploader.clear();
        this._clearCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileNotPdf"));
        return;
      }

      // 2. Boyut Kontrolü (Maksimum 10 MB)
      if (oFile.size > MAX_FILE_SIZE) {
        oUploader.clear();
        this._clearCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileSizeExceeded"));
        return;
      }

      // Dosya geçerli -> Base64 kodlama
      var sSizeFormatted = (oFile.size / (1024 * 1024)).toFixed(2) + " MB";
      if (oFile.size < 1024 * 1024) {
        sSizeFormatted = (oFile.size / 1024).toFixed(1) + " KB";
      }

      var reader = new FileReader();
      reader.onload = function (e) {
        var sBase64 = e.target.result;
        oModel.setProperty("/certificate", {
          hasFile: true,
          fileName: sFileName,
          fileSize: oFile.size,
          fileSizeFormatted: sSizeFormatted,
          base64: sBase64,
          isValid: true,
          statusState: "Success",
          statusIcon: "sap-icon://sys-enter-2"
        });
      };
      reader.onerror = function () {
        oUploader.clear();
        this._clearCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileRequired"));
      }.bind(this);

      reader.readAsDataURL(oFile);
    },

    _clearCertificate: function () {
      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/certificate", {
        hasFile: false,
        fileName: "",
        fileSize: 0,
        fileSizeFormatted: "",
        base64: "",
        isValid: false,
        statusState: "None",
        statusIcon: "sap-icon://document-text"
      });
    },

    onSubmit: async function () {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      var oFormData = oModel.getProperty("/formData");
      var oCertData = oModel.getProperty("/certificate");

      // 1. Zorunlu Alan Doğrulamaları
      var sCompanyName = (oFormData.companyName || "").trim();
      var sContactPerson = (oFormData.contactPerson || "").trim();

      if (!sCompanyName) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errCompanyNameRequired"));
        return;
      }

      if (!sContactPerson) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errContactPersonRequired"));
        return;
      }

      if (!oCertData || !oCertData.isValid || !oCertData.base64) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileRequired"));
        return;
      }

      // 2. Gönderim İşlemi (Çift submit engelleme)
      oModel.setProperty("/isBusy", true);
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);

      var payload = {
        companyName: sCompanyName,
        contactPerson: sContactPerson,
        phone: (oFormData.phone || "").trim() || null,
        country: (oFormData.country || "").trim() || null,
        taxId: (oFormData.taxId || "").trim() || null,
        website: (oFormData.website || "").trim() || null,
        address: (oFormData.address || "").trim() || null,
        notes: (oFormData.notes || "").trim() || null,
        category: oFormData.category || null,
        certificate: oCertData.base64,
        certificateFileName: oCertData.fileName || "certificate.pdf",
        certificateMimeType: "application/pdf"
      };

      var headers = Object.assign({
        "Content-Type": "application/json"
      }, AuthManager.getAuthHeaders());

      try {
        var response = await fetch(SERVICE_BASE + "/createSubmission", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        });

        var data = null;
        try {
          data = await response.json();
        } catch (e) {
          // JSON parse hatası
        }

        if (response.ok) {
          // Başarılı gönderim
          oModel.setProperty("/hasSuccess", true);
          oModel.setProperty("/successMessage", oBundle.getText("submissionSuccessDetails"));
          MessageToast.show(oBundle.getText("submissionSuccess"));

          // Başvuru kaydedildi, mevcut başvuru görünümüne geçir
          await this._loadExistingSubmission();
        } else {
          // Hata yönetimi
          var sErrorMsg = oBundle.getText("authErrUnexpected");
          if (data && data.error && data.error.message) {
            sErrorMsg = data.error.message;
          } else if (data && data.message) {
            sErrorMsg = data.message;
          }
          oModel.setProperty("/hasError", true);
          oModel.setProperty("/errorMessage", sErrorMsg);
        }
      } catch (err) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("authErrServerUnavailable"));
      } finally {
        oModel.setProperty("/isBusy", false);
      }
    },

    _parseEditableFields: function (sEditableFields, oBundle) {
      var FIELD_MAP = {
        'şirket adı': 'companyName',
        'sirket adi': 'companyName',
        'companyname': 'companyName',
        'iletişim kişisi': 'contactPerson',
        'iletisim kisisi': 'contactPerson',
        'contactperson': 'contactPerson',
        'telefon': 'phone',
        'phone': 'phone',
        'ülke': 'country',
        'ulke': 'country',
        'country': 'country',
        'vergi no': 'taxId',
        'vergi numarası': 'taxId',
        'vergi numarasi': 'taxId',
        'taxid': 'taxId',
        'web sitesi': 'website',
        'website': 'website',
        'adres': 'address',
        'address': 'address',
        'notlar': 'notes',
        'notes': 'notes',
        'kategori': 'category',
        'category': 'category',
        'sertifika': 'certificate',
        'certificate': 'certificate'
      };

      var oEditable = {
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
      };

      var LABEL_MAP = {
        companyName: oBundle.getText("companyNameLabel"),
        contactPerson: oBundle.getText("contactPersonLabel"),
        phone: oBundle.getText("phoneLabel"),
        country: oBundle.getText("countryLabel"),
        taxId: oBundle.getText("taxIdLabel"),
        website: oBundle.getText("websiteLabel"),
        address: oBundle.getText("addressLabel"),
        notes: oBundle.getText("notesLabel"),
        category: oBundle.getText("categoryLabel"),
        certificate: oBundle.getText("certificateLabel")
      };

      var aLabels = [];
      if (sEditableFields && typeof sEditableFields === "string") {
        var aTokens = sEditableFields.split(",").map(function (s) {
          return s.trim().toLowerCase();
        }).filter(Boolean);

        aTokens.forEach(function (token) {
          var canonical = FIELD_MAP[token];
          if (canonical && oEditable.hasOwnProperty(canonical)) {
            oEditable[canonical] = true;
            if (LABEL_MAP[canonical] && aLabels.indexOf(LABEL_MAP[canonical]) === -1) {
              aLabels.push(LABEL_MAP[canonical]);
            }
          }
        });
      }

      return {
        flags: oEditable,
        labelSummary: aLabels.join(", ")
      };
    },

    onOpenReApply: function () {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var oSubmission = oModel.getProperty("/existingSubmission");

      if (!oSubmission || oSubmission.status !== "Rejected") {
        return;
      }

      var parsed = this._parseEditableFields(oSubmission.editableFields, oBundle);
      oModel.setProperty("/editableFields", parsed.flags);
      oModel.setProperty("/reApplyEditableLabels", parsed.labelSummary || "-");

      oModel.setProperty("/reApplyFormData", {
        companyName: oSubmission.companyName || "",
        contactPerson: oSubmission.contactPerson || "",
        phone: oSubmission.phone || "",
        country: oSubmission.country || "",
        taxId: oSubmission.taxId || "",
        website: oSubmission.website || "",
        address: oSubmission.address || "",
        notes: oSubmission.notes || "",
        category: oSubmission.category || ""
      });

      this._clearReApplyCertificate();
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);
      oModel.setProperty("/isReApplyMode", true);
    },

    onCancelReApply: function () {
      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/isReApplyMode", false);
      oModel.setProperty("/hasError", false);
    },

    onReApplyFileChange: function (oEvent) {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var oUploader = this.byId("reApplyFileUploader");

      oModel.setProperty("/hasError", false);

      var aFiles = oEvent.getParameter("files");
      if (!aFiles || aFiles.length === 0) {
        this._clearReApplyCertificate();
        return;
      }

      var oFile = aFiles[0];
      var sFileName = oFile.name || "";

      // 1. Format Kontrolü (PDF)
      if (!sFileName.toLowerCase().endsWith(".pdf")) {
        if (oUploader) {
          oUploader.clear();
        }
        this._clearReApplyCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileNotPdf"));
        return;
      }

      // 2. Boyut Kontrolü (<= 10 MB)
      if (oFile.size > MAX_FILE_SIZE) {
        if (oUploader) {
          oUploader.clear();
        }
        this._clearReApplyCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileSizeExceeded"));
        return;
      }

      var sSizeFormatted = (oFile.size / (1024 * 1024)).toFixed(2) + " MB";
      if (oFile.size < 1024 * 1024) {
        sSizeFormatted = (oFile.size / 1024).toFixed(1) + " KB";
      }

      var reader = new FileReader();
      reader.onload = function (e) {
        oModel.setProperty("/reApplyCertificate", {
          hasFile: true,
          fileName: sFileName,
          fileSize: oFile.size,
          fileSizeFormatted: sSizeFormatted,
          base64: e.target.result,
          isValid: true,
          statusState: "Success",
          statusIcon: "sap-icon://sys-enter-2"
        });
      };
      reader.onerror = function () {
        if (oUploader) {
          oUploader.clear();
        }
        this._clearReApplyCertificate();
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errFileRequired"));
      }.bind(this);

      reader.readAsDataURL(oFile);
    },

    _clearReApplyCertificate: function () {
      var oModel = this.getView().getModel("appView");
      oModel.setProperty("/reApplyCertificate", {
        hasFile: false,
        fileName: "",
        fileSize: 0,
        fileSizeFormatted: "",
        base64: "",
        isValid: false,
        statusState: "None",
        statusIcon: "sap-icon://document-text"
      });
      var oUploader = this.byId("reApplyFileUploader");
      if (oUploader) {
        oUploader.clear();
      }
    },

    onReApplySubmit: async function () {
      var oModel = this.getView().getModel("appView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var oSubmission = oModel.getProperty("/existingSubmission");
      var oReApplyData = oModel.getProperty("/reApplyFormData");
      var oCertData = oModel.getProperty("/reApplyCertificate");
      var oEditableFlags = oModel.getProperty("/editableFields");

      if (!oSubmission || oSubmission.status !== "Rejected") {
        return;
      }

      // 1. Zorunlu alan kontrolü (eğer düzenlemeye açıldıysa boş bırakılamaz)
      if (oEditableFlags.companyName && !(oReApplyData.companyName || "").trim()) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errCompanyNameRequired"));
        return;
      }
      if (oEditableFlags.contactPerson && !(oReApplyData.contactPerson || "").trim()) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("errContactPersonRequired"));
        return;
      }

      // 2. En az bir değişiklik yapıldı mı denetimi
      var bHasChange = false;
      var aKeys = ['companyName', 'contactPerson', 'phone', 'country', 'taxId', 'website', 'address', 'notes', 'category'];
      for (var i = 0; i < aKeys.length; i++) {
        var k = aKeys[i];
        if (oEditableFlags[k]) {
          var valNew = (oReApplyData[k] || "").trim();
          var valOld = (oSubmission[k] || "").trim();
          if (valNew !== valOld) {
            bHasChange = true;
            break;
          }
        }
      }

      if (oEditableFlags.certificate && oCertData && oCertData.isValid && oCertData.base64) {
        bHasChange = true;
      }

      if (!bHasChange) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("reApplyNoChanges"));
        return;
      }

      // 3. Payload hazırlığı (Client asla supplier_ID göndermez)
      var payload = {
        submissionId: oSubmission.ID
      };

      aKeys.forEach(function (k) {
        if (oReApplyData[k] !== undefined) {
          payload[k] = typeof oReApplyData[k] === "string" ? oReApplyData[k].trim() : oReApplyData[k];
        }
      });

      if (oEditableFlags.certificate && oCertData && oCertData.isValid && oCertData.base64) {
        payload.certificate = oCertData.base64;
        payload.certificateFileName = oCertData.fileName || "certificate.pdf";
        payload.certificateMimeType = "application/pdf";
      }

      oModel.setProperty("/isBusy", true);
      oModel.setProperty("/hasError", false);

      var headers = Object.assign({
        "Content-Type": "application/json"
      }, AuthManager.getAuthHeaders());

      try {
        var response = await fetch(SERVICE_BASE + "/reApplySubmission", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        });

        var data = null;
        try {
          data = await response.json();
        } catch (e) {}

        if (response.ok) {
          oModel.setProperty("/isReApplyMode", false);
          oModel.setProperty("/hasSuccess", true);
          oModel.setProperty("/successMessage", oBundle.getText("reApplySuccess"));
          MessageToast.show(oBundle.getText("reApplySuccess"));
          await this._loadExistingSubmission();
        } else {
          var sErrorMsg = oBundle.getText("authErrUnexpected");
          if (data && data.error && data.error.message) {
            sErrorMsg = data.error.message;
          } else if (data && data.message) {
            sErrorMsg = data.message;
          }
          oModel.setProperty("/hasError", true);
          oModel.setProperty("/errorMessage", sErrorMsg);
        }
      } catch (err) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("authErrServerUnavailable"));
      } finally {
        oModel.setProperty("/isBusy", false);
      }
    },

    onToggleTheme: function () {
      ThemeManager.toggleTheme();
    },

    onLogout: function () {
      AuthManager.clearSession();
      this._navToAuth();
    },

    _navToAuth: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      if (oRouter) {
        oRouter.navTo("auth", {}, true);
      }
    }
  });
});
