(function (global, factory) {
    "use strict";
    if (typeof sap !== "undefined" && sap.ui && sap.ui.define) {
        sap.ui.define([], factory);
    } else if (typeof module !== "undefined" && module.exports) {
        module.exports = factory();
    }
}(this, function () {
    "use strict";

    return {
        // Duruma göre semantik renk durumunu (Success, Error vb.) belirler
        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "Approved":
                    return "Success";
                case "Rejected":
                    return "Error";
                case "InReview":
                    return "Information";
                case "Pending":
                    return "Warning";
                default:
                    return "None";
            }
        },

        // Duruma uygun SAP ikonunu döner
        formatStatusIcon: function (sStatus) {
            switch (sStatus) {
                case "Approved":
                    return "sap-icon://sys-enter-2";
                case "Rejected":
                    return "sap-icon://sys-cancel-2";
                case "InReview":
                    return "sap-icon://in-progress";
                case "Pending":
                    return "sap-icon://pending";
                default:
                    return "sap-icon://question-mark";
            }
        },

        // ISO tarihini okunabilir tarih/saat formatına çevirir
        formatDateTime: function (sDate) {
            if (!sDate) {
                return "";
            }
            try {
                var oDate = new Date(sDate);
                if (isNaN(oDate.getTime())) {
                    return sDate;
                }
                var sYear = oDate.getFullYear();
                var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
                var sDay = String(oDate.getDate()).padStart(2, "0");
                var sHours = String(oDate.getHours()).padStart(2, "0");
                var sMinutes = String(oDate.getMinutes()).padStart(2, "0");
                return sYear + "-" + sMonth + "-" + sDay + " " + sHours + ":" + sMinutes;
            } catch (e) {
                return sDate;
            }
        }
    };
}));
