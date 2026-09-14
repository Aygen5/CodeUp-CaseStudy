sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "codeup/supplier/portal/model/AuthManager"
], function (Controller, JSONModel, MessageToast, AuthManager) {
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

            oModel.setProperty("/hasExistingSubmission", true);
            oModel.setProperty("/existingSubmission", submission);
            return;
          }
        }

        // Başvuru yok (204 No Content veya boş)
        oModel.setProperty("/hasExistingSubmission", false);
        oModel.setProperty("/existingSubmission", null);
      } catch (err) {
        // Ağ hatası veya backend hatası
        oModel.setProperty("/hasExistingSubmission", false);
      }
    },

    _mapStatusMetadata: function (sStatus, oBundle) {
      switch (sStatus) {
        case "Pending":
          return { text: oBundle.getText("statusPending"), state: "Warning", icon: "sap-icon://pending" };
        case "InReview":
          return { text: oBundle.getText("statusInReview"), state: "Information", icon: "sap-icon://in-progress" };
        case "Approved":
          return { text: oBundle.getText("statusApproved"), state: "Success", icon: "sap-icon://accept" };
        case "Rejected":
          return { text: oBundle.getText("statusRejected"), state: "Error", icon: "sap-icon://decline" };
        default:
          return { text: sStatus || "", state: "None", icon: "sap-icon://status-inactive" };
      }
    },

    onRefreshStatus: function () {
      this._loadExistingSubmission();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      MessageToast.show(oBundle.getText("refreshButton"));
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
