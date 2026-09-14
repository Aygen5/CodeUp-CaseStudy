sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "codeup/supplier/portal/model/AuthManager"
], function (Controller, JSONModel, MessageToast, AuthManager) {
  "use strict";

  return Controller.extend("codeup.supplier.portal.controller.Application", {
    onInit: function () {
      var oViewModel = new JSONModel({
        supplierEmail: "",
        supplierId: "",
        isAuthenticated: false
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
    },

    onLogout: function () {
      AuthManager.clearSession();
      MessageToast.show("Oturum kapatıldı.");
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
