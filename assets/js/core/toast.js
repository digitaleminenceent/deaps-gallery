(() => {
    "use strict";

    window.DEAPS = window.DEAPS || {};

    window.DEAPS.Toast = {

        show(message, type = "info") {
            alert(message);
        },

        success(message) {
            this.show(message, "success");
        },

        warning(message) {
            this.show(message, "warning");
        },

        error(message) {
            this.show(message, "error");
        }

    };

})();