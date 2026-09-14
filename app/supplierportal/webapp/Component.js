sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "codeup/supplier/portal/model/models",
    "codeup/supplier/portal/model/ThemeManager"
], function (UIComponent, Device, models, ThemeManager) {
    "use strict";

    return UIComponent.extend("codeup.supplier.portal.Component", {
        metadata: {
            manifest: "json"
        },

        /**
         * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
         * @public
         * @override
         */
        init: function () {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Set the theme model and initialize theme
            this.setModel(ThemeManager.getModel(), "themeModel");
            ThemeManager.init();

            // Enable routing
            this.getRouter().initialize();
        }
    });
});
