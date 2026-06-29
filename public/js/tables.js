document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("table[data-enhance]").forEach(initTable);
});

function initTable(table) {
  const perPage = 15;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const allRows = Array.from(tbody.querySelectorAll("tr:not(.empty-row)"));
  if (allRows.length === 0) return;

  const card = table.closest(".card");
  const cardHeader = card ? card.querySelector(".card-header") : null;
  let currentPage = 1;
  let filteredRows = [...allRows];

  // -- Sort indicators on headers --
  const headers = table.querySelectorAll("thead th");
  headers.forEach((th, i) => {
    if (th.textContent.trim() === "") return;
    th.style.cursor = "pointer";
    th.style.userSelect = "none";
    th.dataset.sortDir = "";
    th.addEventListener("click", () => sortByColumn(i, th));
  });

  // -- Toolbar: search + export --
  if (cardHeader) {
    const toolbar = document.createElement("div");
    toolbar.className = "d-flex gap-2 align-items-center";
    toolbar.innerHTML = `
      <input type="text" class="form-control form-control-sm tbl-search" placeholder="Buscar..." style="width:180px">
      <button class="btn btn-sm btn-outline-secondary tbl-csv" title="Exportar CSV"><i class="bi bi-download"></i> CSV</button>
    `;
    cardHeader.appendChild(toolbar);

    toolbar.querySelector(".tbl-search").addEventListener("input", function () {
      const q = this.value.toLowerCase();
      filteredRows = allRows.filter(r => r.textContent.toLowerCase().includes(q));
      currentPage = 1;
      render();
    });

    toolbar.querySelector(".tbl-csv").addEventListener("click", () => exportCsv());
  }

  // -- Pagination container --
  const pagDiv = document.createElement("div");
  pagDiv.className = "d-flex justify-content-between align-items-center px-3 py-2";
  pagDiv.style.borderTop = "1px solid var(--border)";
  if (card) card.appendChild(pagDiv);
  else table.parentElement.appendChild(pagDiv);

  function render() {
    const total = filteredRows.length;
    const pages = Math.ceil(total / perPage) || 1;
    if (currentPage > pages) currentPage = pages;
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;

    allRows.forEach(r => (r.style.display = "none"));
    filteredRows.slice(start, end).forEach(r => (r.style.display = ""));

    pagDiv.innerHTML = `
      <small class="text-muted">${total} registro${total !== 1 ? "s" : ""} — pag ${currentPage}/${pages}</small>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-secondary pg-prev" ${currentPage <= 1 ? "disabled" : ""}><i class="bi bi-chevron-left"></i></button>
        <button class="btn btn-sm btn-outline-secondary pg-next" ${currentPage >= pages ? "disabled" : ""}><i class="bi bi-chevron-right"></i></button>
      </div>
    `;
    pagDiv.querySelector(".pg-prev").addEventListener("click", () => { currentPage--; render(); });
    pagDiv.querySelector(".pg-next").addEventListener("click", () => { currentPage++; render(); });

    if (total <= perPage) pagDiv.style.display = "none";
    else pagDiv.style.display = "";
  }

  function sortByColumn(colIdx, th) {
    const dir = th.dataset.sortDir === "asc" ? "desc" : "asc";
    headers.forEach(h => { h.dataset.sortDir = ""; h.querySelectorAll(".sort-arrow").forEach(a => a.remove()); });
    th.dataset.sortDir = dir;
    const arrow = document.createElement("span");
    arrow.className = "sort-arrow ms-1";
    arrow.textContent = dir === "asc" ? "▲" : "▼";
    arrow.style.fontSize = "0.6rem";
    th.appendChild(arrow);

    filteredRows.sort((a, b) => {
      const av = (a.cells[colIdx] ? a.cells[colIdx].textContent.trim() : "");
      const bv = (b.cells[colIdx] ? b.cells[colIdx].textContent.trim() : "");
      const an = parseFloat(av.replace(/[^0-9.-]/g, ""));
      const bn = parseFloat(bv.replace(/[^0-9.-]/g, ""));
      if (!isNaN(an) && !isNaN(bn)) return dir === "asc" ? an - bn : bn - an;
      return dir === "asc" ? av.localeCompare(bv, "es") : bv.localeCompare(av, "es");
    });
    currentPage = 1;
    render();
  }

  function exportCsv() {
    const hdr = Array.from(headers).map(h => h.textContent.replace(/[▲▼]/g, "").trim()).filter(Boolean);
    const rows = filteredRows.map(r =>
      Array.from(r.cells).map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"').join(",")
    );
    const csv = "﻿" + hdr.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (document.title.split("|")[0] || "export").trim() + ".csv";
    a.click();
  }

  render();
}
