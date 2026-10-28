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

        // Bileşen başlangıcı: Temel init, cihaz modeli ve router başlatılır
        init: function () {
            UIComponent.prototype.init.apply(this, arguments);
            this.setModel(models.createDeviceModel(), "device");
            this.getRouter().initialize();
        },

        // Dokunmatik desteğine göre CSS density sınıfını (Compact/Cozy) döner
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
