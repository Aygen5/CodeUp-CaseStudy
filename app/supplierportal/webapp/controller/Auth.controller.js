sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "codeup/supplier/portal/model/AuthManager",
  "codeup/supplier/portal/model/ThemeManager"
], function (Controller, JSONModel, MessageToast, AuthManager, ThemeManager) {
  "use strict";

  var SERVICE_BASE = "/odata/v4/public";

  return Controller.extend("codeup.supplier.portal.controller.Auth", {
    onInit: function () {
      var oViewModel = new JSONModel({
        isRegister: false,
        email: "",
        password: "",
        passwordType: "Password",
        passwordIcon: "sap-icon://show",
        rememberMe: false,
        isBusy: false,
        hasError: false,
        errorMessage: "",
        hasSuccess: false,
        successMessage: "",
        rules: this._getDefaultRules()
      });
      this.getView().setModel(oViewModel, "authView");

      var oRouter = this.getOwnerComponent().getRouter();
      if (oRouter) {
        var oRoute = oRouter.getRoute("auth");
        if (oRoute) {
          oRoute.attachPatternMatched(this._onPatternMatched, this);
        }
        var oTarget = oRouter.getTarget("auth");
        if (oTarget) {
          oTarget.attachDisplay(this._onPatternMatched, this);
        }
      }

      this.getView().addEventDelegate({
        onBeforeShow: this._onPatternMatched.bind(this)
      }, this);
    },

    _onPatternMatched: function () {
      // Her girişte temiz bir login ekranı sunulması için önceki oturumu ve formu sıfırla
      AuthManager.clearSession();

      var oModel = this.getView().getModel("authView");
      if (oModel) {
        oModel.setProperty("/email", "");
        oModel.setProperty("/password", "");
        oModel.setProperty("/passwordType", "Password");
        oModel.setProperty("/passwordIcon", "sap-icon://show");
        oModel.setProperty("/hasSuccess", false);
        oModel.setProperty("/successMessage", "");
        oModel.setProperty("/hasError", false);
        oModel.setProperty("/errorMessage", "");
        oModel.setProperty("/isBusy", false);
        oModel.setProperty("/isRegister", false);
        oModel.setProperty("/rules", this._getDefaultRules());
      }

      // sap.m.App kontrolü içinde Auth sayfasının aktif olmasını garanti et
      var oComponent = this.getOwnerComponent();
      var oRoot = oComponent ? oComponent.getRootControl() : null;
      var oApp = oRoot ? (oRoot.byId ? oRoot.byId("appControl") : null) : null;
      if (oApp && typeof oApp.to === "function") {
        var aPages = oApp.getPages ? oApp.getPages() : [];
        var oAuthPage = aPages.find(function (p) {
          return p.getId && p.getId().indexOf("auth") !== -1;
        });
        if (oAuthPage && oApp.getCurrentPage && oApp.getCurrentPage() !== oAuthPage) {
          oApp.to(oAuthPage);
        }
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
      oModel.setProperty("/passwordType", "Password");
      oModel.setProperty("/passwordIcon", "sap-icon://show");
      oModel.setProperty("/hasError", false);
      oModel.setProperty("/hasSuccess", false);
      oModel.setProperty("/rules", this._getDefaultRules());
    },

    onTogglePasswordVisibility: function () {
      var oModel = this.getView().getModel("authView");
      var sCurrentType = oModel.getProperty("/passwordType") || "Password";
      var bIsPassword = sCurrentType === "Password";
      oModel.setProperty("/passwordType", bIsPassword ? "Text" : "Password");
      oModel.setProperty("/passwordIcon", bIsPassword ? "sap-icon://hide" : "sap-icon://show");
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

    onToggleTheme: function () {
      ThemeManager.toggleTheme();
    },

    _navToApplication: function () {
      var oComponent = this.getOwnerComponent();
      var oRouter = oComponent ? oComponent.getRouter() : null;

      // 1. Hedef görünümü (Target) doğrudan görüntüle (FLP Sandbox ile %100 uyumlu)
      if (oRouter && oRouter.getTargets()) {
        try {
          oRouter.getTargets().display("application");
        } catch (e) {
          // Targets display hatası
        }
      }

      // 2. Standart Router navTo çağrısı (Standalone ve hash geçmişi desteği için)
      if (oRouter) {
        try {
          oRouter.navTo("application", {}, {}, true);
        } catch (e) {
          // FLP Shell hash changer uyarısını yut
        }
      }

      // 3. Fallback: sap.m.App (NavContainer) üzerinden doğrudan geçiş yap
      try {
        var oRoot = oComponent ? oComponent.getRootControl() : null;
        var oApp = oRoot ? (oRoot.byId ? oRoot.byId("appControl") : null) : null;
        if (oApp && typeof oApp.to === "function") {
          var aPages = oApp.getPages ? oApp.getPages() : [];
          var oAppPage = aPages.find(function (p) {
            return p.getId && p.getId().indexOf("application") !== -1;
          });
          if (oAppPage) {
            oApp.to(oAppPage);
          }
        }
      } catch (e) {}
    }
  });
});
