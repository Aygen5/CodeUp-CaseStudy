sap.ui.define([
  "sap/ui/base/Object"
], function (BaseObject) {
  "use strict";

  var STORAGE_KEY = "codeup_supplier_session";

  var AuthManager = BaseObject.extend("codeup.supplier.portal.model.AuthManager", {
    constructor: function () {
      BaseObject.apply(this, arguments);
      this._session = this._loadInitialSession();
    },

    _loadInitialSession: function () {
      try {
        var raw = window.sessionStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.token && parsed.supplierId) {
            return parsed;
          }
        }
      } catch (e) {
        // storage disabled or corrupt
      }
      return null;
    },

    setSession: function (sessionData, bRememberMe) {
      if (!sessionData || !sessionData.token) {
        return;
      }
      this._session = {
        token: sessionData.token,
        supplierId: sessionData.supplierId,
        email: sessionData.email,
        savedAt: new Date().toISOString()
      };

      try {
        var str = JSON.stringify(this._session);
        window.sessionStorage.setItem(STORAGE_KEY, str);
        if (bRememberMe) {
          window.localStorage.setItem(STORAGE_KEY, str);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        // Ignore storage exceptions in restricted environments
      }
    },

    getSession: function () {
      return this._session;
    },

    getToken: function () {
      return this._session ? this._session.token : null;
    },

    getSupplierId: function () {
      return this._session ? this._session.supplierId : null;
    },

    getEmail: function () {
      return this._session ? this._session.email : null;
    },

    isAuthenticated: function () {
      return !!(this._session && this._session.token);
    },

    clearSession: function () {
      this._session = null;
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Ignore
      }
    },

    getAuthHeaders: function () {
      var token = this.getToken();
      if (!token) {
        return {};
      }
      return {
        "Authorization": "Bearer " + token,
        "X-Supplier-Token": token
      };
    }
  });

  // Singleton instance
  var instance = new AuthManager();
  return instance;
});
