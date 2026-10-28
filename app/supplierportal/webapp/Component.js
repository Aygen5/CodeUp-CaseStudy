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

        // Uygulama başlangıcı: Modeller, tema yöneticisi ve yönlendirme başlatılır
        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Cihaz ve tema modellerini bağlar
            this.setModel(models.createDeviceModel(), "device");
            this.setModel(ThemeManager.getModel(), "themeModel");
            ThemeManager.init();

            // Router başlatılır
            this.getRouter().initialize();
        }
    });
});
