(() => {
    "use strict";

    window.DEAPS = window.DEAPS || {};

    function show(message, type = "warning") {

        const container = document.getElementById("deapsToastContainer");
        if (!container) {
            alert(message);
            return;
        }

        const colors = {
            success: "text-bg-success",
            warning: "text-bg-warning",
            error: "text-bg-danger",
            info: "text-bg-primary"
        };

        const toast = document.createElement("div");

        toast.className = `toast align-items-center border-0 ${colors[type] || colors.info}`;

        toast.setAttribute("role", "alert");
        toast.setAttribute("aria-live", "assertive");
        toast.setAttribute("aria-atomic", "true");

        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button"
                    class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast">
                </button>
            </div>
        `;

        container.appendChild(toast);

        const bsToast = new bootstrap.Toast(toast, {
            delay: 3000
        });

        bsToast.show();

        toast.addEventListener("hidden.bs.toast", () => {
            toast.remove();
        });
    }

    window.DEAPS.Toast = {
        show,
        success: (msg) => show(msg, "success"),
        warning: (msg) => show(msg, "warning"),
        error: (msg) => show(msg, "error"),
        info: (msg) => show(msg, "info")
    };

})();