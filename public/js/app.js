document.addEventListener("DOMContentLoaded", () => {
  // Confirm dialogs
  document.querySelectorAll("[data-confirm]").forEach(el => {
    el.addEventListener("click", e => {
      if (!confirm(el.dataset.confirm)) e.preventDefault();
    });
  });

  // Bootstrap tooltips
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    new bootstrap.Tooltip(el);
  });

  // Entry animations — stagger cards and table rows
  document.querySelectorAll(".stat-card, .card").forEach((el, i) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    setTimeout(() => {
      el.style.transition = "opacity 0.35s ease, transform 0.35s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, 40 + i * 30);
  });

  // Toast: read flash cookie and show
  const flash = getCookie("flash");
  if (flash) {
    document.cookie = "flash=; path=/; max-age=0";
    showToast(decodeURIComponent(flash));
  }
});

function getCookie(name) {
  const v = document.cookie.match("(^|;)\\s*" + name + "=([^;]*)");
  return v ? v[2] : null;
}

function showToast(message, type) {
  type = type || "success";
  const icons = { success: "bi-check-circle-fill", error: "bi-x-circle-fill", info: "bi-info-circle-fill", warning: "bi-exclamation-triangle-fill" };
  const colors = { success: "var(--green)", error: "var(--red)", info: "var(--blue)", warning: "var(--orange)" };
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.innerHTML = '<i class="bi ' + (icons[type] || icons.success) + '" style="color:' + (colors[type] || colors.success) + '"></i> ' + message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  });
}
