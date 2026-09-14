sap.ui.define([
  "sap/ui/base/Object",
  "sap/ui/core/Theming",
  "sap/ui/model/json/JSONModel"
], function (BaseObject, Theming, JSONModel) {
  "use strict";

  var THEME_STORAGE_KEY = "codeup_supplier_portal_theme";
  var THEME_DARK = "sap_horizon_dark";   // Evening Horizon
  var THEME_LIGHT = "sap_horizon";       // Morning Horizon

  var ThemeManager = BaseObject.extend("codeup.supplier.portal.model.ThemeManager", {
    constructor: function () {
      BaseObject.apply(this, arguments);

      var sInitialTheme = this._getSavedTheme() || THEME_DARK;
      this._themeModel = new JSONModel({
        currentTheme: sInitialTheme,
        isDark: sInitialTheme === THEME_DARK
      });

      // SAPUI5 Theming olay dinleyicisi: Temanın başarıyla uygulandığını takip et
      if (Theming && typeof Theming.attachApplied === "function") {
        Theming.attachApplied(function (oEvent) {
          var sApplied = (oEvent && oEvent.theme) || Theming.getTheme();
          if (sApplied === THEME_DARK || sApplied === THEME_LIGHT) {
            this._themeModel.setProperty("/currentTheme", sApplied);
            this._themeModel.setProperty("/isDark", sApplied === THEME_DARK);
          }
        }.bind(this));
      }
    },

    getModel: function () {
      return this._themeModel;
    },

    _getSavedTheme: function () {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          return window.localStorage.getItem(THEME_STORAGE_KEY);
        }
      } catch (e) {
        // İstemci depolama kısıtlaması
      }
      return null;
    },

    getCurrentTheme: function () {
      return this._themeModel.getProperty("/currentTheme");
    },

    isDark: function () {
      return this._themeModel.getProperty("/isDark");
    },

    init: function () {
      var sTheme = this.getCurrentTheme();
      this.applyTheme(sTheme);
    },

    applyTheme: function (sTheme) {
      if (sTheme !== THEME_DARK && sTheme !== THEME_LIGHT) {
        sTheme = THEME_DARK;
      }

      this._themeModel.setProperty("/currentTheme", sTheme);
      this._themeModel.setProperty("/isDark", sTheme === THEME_DARK);

      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(THEME_STORAGE_KEY, sTheme);
        }
      } catch (e) {}

      // Modern SAPUI5 Theming API çağrısı
      if (Theming && typeof Theming.setTheme === "function") {
        Theming.setTheme(sTheme);
      }
    },

    toggleTheme: function () {
      var sNext = this.isDark() ? THEME_LIGHT : THEME_DARK;
      this.applyTheme(sNext);
      return sNext;
    }
  });

  return new ThemeManager();
});
