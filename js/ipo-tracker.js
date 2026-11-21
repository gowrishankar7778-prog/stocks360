/**
 * Stocks 360 - NSE Mainboard & SME IPO Tracker (ipo-tracker.js)
 * Tabbed WCAG AAA View: Open IPOs (Default) | Upcoming IPOs | Recently Listed IPOs
 */
(function () {
  let activeTab = "open";

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtPrice(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    return "₹ " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  }

  function announceA11y(text) {
    try {
      if (typeof window !== "undefined" && typeof window.speakText === "function" && typeof localStorage !== "undefined" && localStorage.getItem("stocks360_special_a11y") === "true") {
        window.speakText(text, true);
      }
    } catch (_) {}
  }

  function renderCurrentOrUpcomingTable(rows, emptyMsg, regionLabel) {
    const bodyHtml =
      rows.length > 0
        ? rows
            .map((r, idx) => {
              const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
              const nameCell = r.symbol
                ? `<a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(r.companyName)}</a>`
                : `<strong style="color:#0f172a;">${esc(r.companyName)}</strong>`;
              return `
                <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
                  <td style="padding:11px 14px;">${nameCell}</td>
                  <td style="padding:11px 14px; color:#475569; white-space:nowrap;">${esc(r.series || "Equity")}</td>
                  <td style="padding:11px 14px; color:#0f172a; white-space:nowrap;">${esc(r.issueStartDate)}</td>
                  <td style="padding:11px 14px; color:#0f172a; white-space:nowrap;">${esc(r.issueEndDate)}</td>
                  <td style="padding:11px 14px; font-weight:700; color:#0f172a; white-space:nowrap;">${esc(r.issuePrice)}</td>
                  <td style="padding:11px 14px; text-align:right; color:#334155; white-space:nowrap;">${esc(r.issueSizeText)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="6" style="padding:24px; text-align:center; color:#64748b;">${esc(emptyMsg)}</td></tr>`;

    return `
      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="${esc(regionLabel)}" style="overflow-x:auto;">
        <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem; min-width:680px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
              <th scope="col" style="padding:10px 14px; text-align:left;">Company</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Board / Series</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Open Date</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Close Date</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Price Band</th>
              <th scope="col" style="padding:10px 14px; text-align:right;">Issue Size</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderPastTable(rows) {
    const bodyHtml =
      rows.length > 0
        ? rows
            .map((r, idx) => {
              const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
              const gainColor = r.gainPct == null ? "#475569" : r.gainPct >= 0 ? "#16a34a" : "#dc2626";
              const symHtml = r.symbol
                ? `<a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(r.symbol)}</a>`
                : "--";
              return `
                <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
                  <td style="padding:11px 14px;">
                    ${symHtml}
                    <div style="font-size:0.78rem; color:#64748b;">${esc(r.companyName)}</div>
                  </td>
                  <td style="padding:11px 14px; color:#475569; white-space:nowrap;">${esc(r.securityType)}</td>
                  <td style="padding:11px 14px; color:#0f172a; white-space:nowrap;">${esc(r.listingDate)}</td>
                  <td style="padding:11px 14px; text-align:right; color:#0f172a; font-weight:700; white-space:nowrap;">${fmtPrice(r.issuePrice)}</td>
                  <td style="padding:11px 14px; text-align:right; color:#0f172a; font-weight:700; white-space:nowrap;">${fmtPrice(r.cmp)}</td>
                  <td style="padding:11px 14px; text-align:right; font-weight:800; color:${gainColor}; white-space:nowrap;">${fmtPct(r.gainPct)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="6" style="padding:24px; text-align:center; color:#64748b;">No recently listed IPO records available.</td></tr>`;

    return `
      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="Recently Listed IPOs Table" style="overflow-x:auto;">
        <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem; min-width:680px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
              <th scope="col" style="padding:10px 14px; text-align:left;">Company</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Board</th>
              <th scope="col" style="padding:10px 14px; text-align:left;">Listing Date</th>
              <th scope="col" style="padding:10px 14px; text-align:right;">Issue Price</th>
              <th scope="col" style="padding:10px 14px; text-align:right;">Current CMP</th>
              <th scope="col" style="padding:10px 14px; text-align:right;">Gain / Loss %</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderIpoView(tabName) {
    activeTab = tabName || "open";
    const root = document.getElementById("ipo-tracker-root");
    const data = (typeof window !== "undefined" && window.STOCKS_IPO_DATA) || null;
    if (!root) return;

    if (!data) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">IPO data is currently unavailable.</div>`;
      return;
    }

    const openRows = Array.isArray(data.openIpos) ? data.openIpos : [];
    const upcomingRows = Array.isArray(data.upcomingIpos) ? data.upcomingIpos : [];
    const pastRows = Array.isArray(data.pastIpos) ? data.pastIpos : [];

    const tabs = [
      { id: "open", label: `Open IPOs (${openRows.length})` },
      { id: "upcoming", label: `Upcoming IPOs (${upcomingRows.length})` },
      { id: "past", label: `Recently Listed IPOs (${pastRows.length})` }
    ];

    let panelHtml = "";
    let panelTitle = "";
    if (activeTab === "upcoming") {
      panelTitle = "Upcoming NSE IPOs";
      panelHtml = renderCurrentOrUpcomingTable(upcomingRows, "No upcoming IPOs scheduled on NSE right now.", panelTitle);
    } else if (activeTab === "past") {
      panelTitle = "Recently Listed IPOs Performance";
      panelHtml = renderPastTable(pastRows);
    } else {
      panelTitle = "Open / Live NSE IPOs";
      panelHtml = renderCurrentOrUpcomingTable(openRows, "No IPO issues are currently open on NSE.", panelTitle);
    }

    root.innerHTML = `
      <div role="tablist" aria-label="IPO Categories" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
        ${tabs
          .map((t) => {
            const isSel = activeTab === t.id;
            return `
              <button
                type="button"
                role="tab"
                id="ipo-tab-${t.id}"
                aria-selected="${isSel ? "true" : "false"}"
                aria-controls="ipo-panel-box"
                data-tab="${t.id}"
                style="padding:9px 16px; border-radius:8px; border:1px solid ${isSel ? "#0f172a" : "#cbd5e1"}; background:${isSel ? "#0f172a" : "#ffffff"}; color:${isSel ? "#ffffff" : "#334155"}; font-weight:700; font-size:0.9rem; cursor:pointer;"
              >
                ${esc(t.label)}
              </button>
            `;
          })
          .join("")}
      </div>

      <div id="ipo-panel-box" role="tabpanel" aria-labelledby="ipo-tab-${activeTab}" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
          <h2 id="ipo-section-heading" tabindex="-1" style="margin:0; font-size:1.12rem; color:#0f172a; font-weight:800;">${esc(panelTitle)}</h2>
        </div>
        ${panelHtml}
      </div>
    `;

    root.querySelectorAll('[role="tab"]').forEach((btn) => {
      btn.addEventListener("click", function () {
        const nextTab = this.getAttribute("data-tab");
        renderIpoView(nextTab);
        announceA11y(`Showing ${nextTab} IPOs.`);
      });
    });
  }

  function init() {
    renderIpoView("open");
  }

  if (typeof window !== "undefined") {
    window.StocksIpoTracker = { renderIpoView };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
