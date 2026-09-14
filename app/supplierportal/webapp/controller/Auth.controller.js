sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "codeup/supplier/portal/model/AuthManager"
], function (Controller, JSONModel, MessageToast, AuthManager) {
  "use strict";

  var SERVICE_BASE = "/odata/v4/public";

  return Controller.extend("codeup.supplier.portal.controller.Auth", {
    onInit: function () {
      var oViewModel = new JSONModel({
        isRegister: false,
        email: "",
        password: "",
        rememberMe: true,
        isBusy: false,
        hasError: false,
        errorMessage: "",
        hasSuccess: false,
        successMessage: "",
        rules: this._getDefaultRules()
      });
      this.getView().setModel(oViewModel, "authView");

      // Oturum zaten varsa doğrudan başvuru ekranına yönlendir
      var oRouter = this.getOwnerComponent().getRouter();
      if (oRouter) {
        oRouter.getRoute("auth").attachPatternMatched(this._onPatternMatched, this);
      }
    },

    _onPatternMatched: function () {
      if (AuthManager.isAuthenticated()) {
        this._navToApplication();
      }
    },

    _getDefaultRules: function () {
      return {
        minChar: { valid: false, icon: "sap-icon://sys-cancel", state: "None" },
        uppercase: { valid: false, icon: "sap-icon://sys-cancel", state: "None" },
        lowercase: { valid: false, icon: "sap-icon://sys-cancel", state: "None" },
        number: { valid: false, icon: "sap-icon://sys-cancel", state: "None" },
        special: { valid: false, icon: "sap-icon://sys-cancel", state: "None" }
      };
    },

    _evaluatePasswordRules: function (sPassword) {
      var sPwd = sPassword || "";
      var bMinChar = sPwd.length >= 8;
      var bUpper = /[A-Z]/.test(sPwd);
      var bLower = /[a-z]/.test(sPwd);
      var bNumber = /[0-9]/.test(sPwd);
      var bSpecial = /[^A-Za-z0-9]/.test(sPwd);

      return {
        minChar: {
          valid: bMinChar,
          icon: bMinChar ? "sap-icon://sys-enter-2" : "sap-icon://sys-cancel",
          state: bMinChar ? "Success" : "None"
        },
        uppercase: {
          valid: bUpper,
          icon: bUpper ? "sap-icon://sys-enter-2" : "sap-icon://sys-cancel",
          state: bUpper ? "Success" : "None"
        },
        lowercase: {
          valid: bLower,
          icon: bLower ? "sap-icon://sys-enter-2" : "sap-icon://sys-cancel",
          state: bLower ? "Success" : "None"
        },
        number: {
          valid: bNumber,
          icon: bNumber ? "sap-icon://sys-enter-2" : "sap-icon://sys-cancel",
          state: bNumber ? "Success" : "None"
        },
        special: {
          valid: bSpecial,
          icon: bSpecial ? "sap-icon://sys-enter-2" : "sap-icon://sys-cancel",
          state: bSpecial ? "Success" : "None"
        }
      };
    },

    onEmailLiveChange: function () {
      var oModel = this.getView().getModel("authView");
      oModel.setProperty("/hasError", false);
    },

    onPasswordLiveChange: function (oEvent) {
      var sValue = oEvent.getParameter("value") || "";
      var oModel = this.getView().getModel("authView");
      oModel.setProperty("/hasError", false);

      var oRules = this._evaluatePasswordRules(sValue);
      oModel.setProperty("/rules", oRules);
    },

    onToggleAuthMode: function () {
      var oModel = this.getView().getModel("authView");
      var bCurrent = oModel.getProperty("/isRegister");
      oModel.setProperty("/isRegister", !bCurrent);
      oModel.setProperty("/password", "");
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);
      oModel.setProperty("/rules", this._getDefaultRules());
    },

    onErrorStripClose: function () {
      var oModel = this.getView().getModel("authView");
      oModel.setProperty("/hasError", false);
    },

    onQuickDemoFill: function () {
      var oModel = this.getView().getModel("authView");
      oModel.setProperty("/email", "acme@industrial.de");
      oModel.setProperty("/password", "SecurePassword123!");
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/isRegister", false);
    },

    onSubmit: async function () {
      var oModel = this.getView().getModel("authView");
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      var sEmail = (oModel.getProperty("/email") || "").trim();
      var sPassword = oModel.getProperty("/password") || "";
      var bIsRegister = oModel.getProperty("/isRegister");
      var bRememberMe = oModel.getProperty("/rememberMe");

      // 1. Temel Girdi Doğrulamaları
      if (!sEmail) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("authErrEmailRequired"));
        return;
      }

      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sEmail)) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("authErrEmailInvalid"));
        return;
      }

      if (!sPassword) {
        oModel.setProperty("/hasError", true);
        oModel.setProperty("/errorMessage", oBundle.getText("authErrPasswordRequired"));
        return;
      }

      // Kayıt modunda 5 kuralın tamamı sağlanmalı
      if (bIsRegister) {
        var oRules = this._evaluatePasswordRules(sPassword);
        var bAllRulesValid = oRules.minChar.valid &&
                             oRules.uppercase.valid &&
                             oRules.lowercase.valid &&
                             oRules.number.valid &&
                             oRules.special.valid;

        if (!bAllRulesValid) {
          oModel.setProperty("/hasError", true);
          oModel.setProperty("/errorMessage", oBundle.getText("authErrPasswordRulesNotMet"));
          return;
        }
      }

      // 2. Gerçek CAP Backend Çağrısı
      oModel.setProperty("/isBusy", true);
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);

      var sAction = bIsRegister ? "register" : "login";
      var sUrl = SERVICE_BASE + "/" + sAction;

      try {
        var response = await fetch(sUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: sEmail,
            password: sPassword
          })
        });

        var data = null;
        try {
          data = await response.json();
        } catch (e) {
          // Yanıt JSON formatında değilse
        }

        if (response.ok && data) {
          // Başarılı giriş / kayıt
          var oAuthData = data.value || data;
          AuthManager.setSession({
            token: oAuthData.token,
            supplierId: oAuthData.supplierId,
            email: oAuthData.email
          }, bRememberMe);

          var sSuccessText = bIsRegister
            ? oBundle.getText("authSuccessRegister")
            : oBundle.getText("authSuccessLogin");

          oModel.setProperty("/hasSuccess", true);
          oModel.setProperty("/successMessage", sSuccessText);

          MessageToast.show(sSuccessText);

          // Kısa bir süre sonra başvuru rotasına geç
          setTimeout(function () {
            this._navToApplication();
          }.bind(this), 600);
        } else {
          // Hata yönetimi
          var sErrorMsg = this._parseBackendError(data, response.status, oBundle);
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

    _parseBackendError: function (data, statusCode, oBundle) {
      if (statusCode === 401) {
        return oBundle.getText("authErrInvalidCredentials");
      }

      var rawMsg = "";
      if (data && data.error && data.error.message) {
        rawMsg = data.error.message;
      } else if (data && data.message) {
        rawMsg = data.message;
      }

      if (rawMsg.includes("zaten mevcut") || rawMsg.includes("already exists")) {
        return oBundle.getText("authErrEmailAlreadyExists");
      }
      if (rawMsg.includes("Geçerli bir e-posta")) {
        return oBundle.getText("authErrEmailInvalid");
      }
      if (rawMsg.includes("Şifre") || rawMsg.includes("şifre")) {
        return rawMsg;
      }

      if (rawMsg) {
        return rawMsg;
      }

      return oBundle.getText("authErrUnexpected");
    },

    _navToApplication: function () {
      var oRouter = this.getOwnerComponent().getRouter();
      if (oRouter) {
        oRouter.navTo("application", {}, true);
      }
    }
  });
});
