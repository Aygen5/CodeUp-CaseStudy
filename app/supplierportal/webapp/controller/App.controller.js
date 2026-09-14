sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("codeup.supplier.portal.controller.App", {
        onInit: function () {
            // Apply compact or cozy content density based on device
            this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass ? this.getOwnerComponent().getContentDensityClass() : "sapUiSizeCompact");
        }
    });
});
