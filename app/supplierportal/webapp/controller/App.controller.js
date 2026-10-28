sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("codeup.supplier.portal.controller.App", {
        onInit: function () {
            // Cihaza göre içerik yoğunluğunu (compact/cozy) ayarlar
            this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass ? this.getOwnerComponent().getContentDensityClass() : "sapUiSizeCompact");
        }
    });
});
