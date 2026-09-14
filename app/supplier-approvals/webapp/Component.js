sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "codeup/supplier/approvals/model/models"
], function (UIComponent, Device, models) {
    "use strict";

    return UIComponent.extend("codeup.supplier.approvals.Component", {
        metadata: {
            manifest: "json"
        },

        /**
         * Component initialization called automatically by UI5 on startup.
         * @public
         * @override
         */
        init: function () {
            // Call base component init
            UIComponent.prototype.init.apply(this, arguments);

            // Set device model
            this.setModel(models.createDeviceModel(), "device");

            // Enable routing
            this.getRouter().initialize();
        },

        /**
         * Returns the content density class based on device touch support
         * @public
         * @returns {string} CSS class name
         */
        getContentDensityClass: function () {
            if (!this._sContentDensityClass) {
                if (!Device.support.touch) {
                    this._sContentDensityClass = "sapUiSizeCompact";
                } else {
                    this._sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this._sContentDensityClass;
        }
    });
});
