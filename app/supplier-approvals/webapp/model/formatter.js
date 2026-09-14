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
        /**
         * Maps submission status to SAPUI5 semantic ValueState/ObjectStatus state.
         * @param {string} sStatus Status key (Pending, InReview, Approved, Rejected)
         * @returns {string} ValueState (Warning, Information, Success, Error, None)
         */
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

        /**
         * Maps submission status to SAPUI5 icon URI.
         * @param {string} sStatus Status key
         * @returns {string} Icon URI
         */
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

        /**
         * Formats ISO date string to readable localized date and time.
         * @param {string} sDate ISO date string
         * @returns {string} Localized date string
         */
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
