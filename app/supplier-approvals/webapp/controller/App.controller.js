sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("codeup.supplier.approvals.controller.App", {
        onInit: function () {
            // Apply compact or cozy content density based on device
            var oOwnerComponent = this.getOwnerComponent();
            if (oOwnerComponent && oOwnerComponent.getContentDensityClass) {
                this.getView().addStyleClass(oOwnerComponent.getContentDensityClass());
            } else {
                this.getView().addStyleClass("sapUiSizeCompact");
            }
        }
    });
});
