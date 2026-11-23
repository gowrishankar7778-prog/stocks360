/**
 * Stocks 360 - NSE Mainboard & SME IPO Tracker (ipo-tracker.js)
 * Tabbed WCAG AAA View: Open IPOs (Default) | Upcoming IPOs | Recently Listed IPOs
 * Features official NSE IPO research panels (lot size, category subscription, RHP/Ratios links, registrar/BRLMs)
 * and interactive search + board filters on Recently Listed IPOs.
 */
(function () {
  let activeTab = "open";
  let selectedResearchSymbol = null;
  let lastResearchTriggerId = null;
  let pastSearchQuery = "";
  let pastBoardFilter = "ALL";
  let pastShowAll = false;
  let escapeBound = false;

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

  function fmtIntRs(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    return "₹ " + Math.round(v).toLocaleString("en-IN");
  }

  function fmtCr(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return "--";
    return "₹ " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Cr";
  }

  function fmtPct(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  }

  function fmtShares(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    return Math.round(v).toLocaleString("en-IN");
  }

  function formatBoardLabel(val) {
    const clean = String(val || "Equity").trim();
    if (/^EQ$/i.test(clean) || /^Equity$/i.test(clean)) return "Mainboard (EQ)";
    if (/^SME$/i.test(clean)) return "SME";
    return clean;
  }

  function parseIpoDate(dateStr) {
    const m = String(dateStr || "").trim().match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
    if (!m) return null;
    const months = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = months[m[2].toUpperCase()];
    if (mo === undefined) return null;
    const dt = new Date(Date.UTC(yr, mo, Number(m[1])));
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function getSixMonthListedIpos(pastRows, refIso) {
    let ref = refIso ? new Date(refIso) : new Date();
    if (!Number.isFinite(ref.getTime())) ref = new Date();
    const cutoff = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 6, ref.getUTCDate()));
    return (pastRows || []).filter((r) => {
      if (!r) return false;
      const dt = parseIpoDate(r.listingDate);
      return Boolean(dt && dt.getTime() >= cutoff.getTime());
    });
  }

  function formatUpdatedHint(iso) {
    if (!iso) return "Official NSE IPO Disclosures";
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "Official NSE IPO Disclosures";
      const fmt = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
      return `Official NSE IPO Disclosures • Updated ${fmt}`;
    } catch (_) {
      return "Official NSE IPO Disclosures";
    }
  }

  function announceA11y(text) {
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.speakText === "function" &&
        typeof localStorage !== "undefined" &&
        localStorage.getItem("stocks360_special_a11y") === "true"
      ) {
        window.speakText(text, true);
      }
    } catch (_) {}
  }

  function getData() {
    return (typeof window !== "undefined" && window.STOCKS_IPO_DATA) || null;
  }

  function findItemInActiveTab(sym) {
    const data = getData();
    if (!data || !sym) return null;
    const upper = String(sym).toUpperCase();
    const list =
      activeTab === "upcoming"
        ? (Array.isArray(data.upcomingIpos) ? data.upcomingIpos : [])
        : activeTab === "open"
          ? (Array.isArray(data.openIpos) ? data.openIpos : [])
          : [];
    const hit = list.find((r) => r && String(r.symbol || "").toUpperCase() === upper);
    if (hit) return hit;
    const all = ([]).concat(
      Array.isArray(data.openIpos) ? data.openIpos : [],
      Array.isArray(data.upcomingIpos) ? data.upcomingIpos : []
    );
    return all.find((r) => r && String(r.symbol || "").toUpperCase() === upper) || null;
  }

  function buildKvCard(label, value) {
    return `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
        <dt style="font-size:0.74rem; text-transform:uppercase; letter-spacing:0.03em; color:#475569; font-weight:700; margin-bottom:4px;">${esc(label)}</dt>
        <dd style="margin:0; font-size:0.88rem; color:#0f172a; font-weight:700; line-height:1.45;">${esc(value || "--")}</dd>
      </div>
    `;
  }

  function renderResearchDetailPanel(item) {
    if (!item) return "";
    const r = item.research || {};
    const lotSize = item.lotSize != null ? item.lotSize : r.lotSize;
    const minInv = item.minInvestment != null ? item.minInvestment : r.minInvestment;
    const lotSummary = r.bidLotText || (lotSize ? `${lotSize} Equity Shares` : "--");
    const minInvText = minInv ? `${fmtIntRs(minInv)}${lotSize ? ` (${lotSize} shares at upper band)` : ""}` : "--";
    const sizeText = item.issueSizeCr
      ? `${fmtCr(item.issueSizeCr)}${item.issueSizeText && item.issueSizeText !== "--" ? ` (${item.issueSizeText})` : ""}`
      : (item.issueSizeText || "--");

    const kvItems = [
      ["Issue Type", r.issueType || "Book Building"],
      ["Board / Series", formatBoardLabel(item.series)],
      ["Bidding Period", `${item.issueStartDate || "--"} to ${item.issueEndDate || "--"}`],
      ["Price Band", item.issuePrice || "--"],
      ["Face Value", r.faceValue || "--"],
      ["Tick Size", r.tickSize || "--"],
      ["Bid Lot", lotSummary],
      ["Est. Min Retail Investment", minInvText],
      ["Est. Issue Size", sizeText],
      r.discount ? ["Employee / Retail Discount", r.discount] : null,
      ["Max Retail Investment", r.maxRetailAmount || "Rs. 2,00,000"],
      r.maxEmployeeAmount ? ["Max Employee Limit", r.maxEmployeeAmount] : null,
      r.maxShareholderAmount ? ["Max Shareholder Limit", r.maxShareholderAmount] : null,
      ["IPO Market Timings", r.marketTimings || "10.00 a.m. to 5.00 p.m."],
      ["UPI Mandate Cut-Off", r.upiCutoff || "--"]
    ].filter(Boolean);

    const subRows = Array.isArray(r.subscription)
      ? r.subscription.filter((row) => row && ((row.offeredShares || 0) > 0 || (row.bidShares || 0) > 0))
      : [];

    const subscriptionHtml = subRows.length > 0
      ? `
        <div style="margin-top:20px;">
          <h4 style="margin:0 0 10px 0; font-size:0.98rem; color:#0f172a; font-weight:800;">Category-Wise Subscription Status</h4>
          <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="Category-Wise Subscription Breakdown" style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
            <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.86rem; min-width:540px;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.75rem; text-transform:uppercase;">
                  <th scope="col" style="padding:9px 12px; text-align:left;">Investor Category</th>
                  <th scope="col" style="padding:9px 12px; text-align:right;">Shares Offered</th>
                  <th scope="col" style="padding:9px 12px; text-align:right;">Shares Bid</th>
                  <th scope="col" style="padding:9px 12px; text-align:right;">Subscription (x)</th>
                </tr>
              </thead>
              <tbody>
                ${subRows
                  .map((row, idx) => {
                    const isMajor = /^(total|1|2|2\.1|2\.2|3|4)$/i.test(String(row.srNo || "").trim()) || /^total$/i.test(row.category);
                    const bg = /^total$/i.test(row.category) ? "#eff6ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                    const weight = isMajor ? "800" : "500";
                    const timesText = typeof row.times === "number" ? `${row.times.toFixed(2)}x` : "--";
                    const timesColor = typeof row.times === "number" && row.times >= 1 ? "#15803d" : "#334155";
                    return `
                      <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px 12px; color:#0f172a; font-weight:${weight};">${esc(row.category)}</td>
                        <td style="padding:8px 12px; text-align:right; color:#334155; font-weight:${weight}; white-space:nowrap;">${row.offeredShares != null ? fmtShares(row.offeredShares) : "--"}</td>
                        <td style="padding:8px 12px; text-align:right; color:#0f172a; font-weight:${weight}; white-space:nowrap;">${row.bidShares != null ? fmtShares(row.bidShares) : "--"}</td>
                        <td style="padding:8px 12px; text-align:right; color:${timesColor}; font-weight:800; white-space:nowrap;">${timesText}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `
      : "";

    const docLinks = Array.isArray(r.documents) ? r.documents : [];
    const docHtml = `
      <div style="margin-top:20px;">
        <h4 style="margin:0 0 10px 0; font-size:0.98rem; color:#0f172a; font-weight:800;">Official NSE Research Documents</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${docLinks
            .map(
              (doc) => `
              <a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:7px; border:1px solid #bfdbfe; background:#eff6ff; color:#1d4ed8; font-weight:700; font-size:0.84rem; text-decoration:none;">
                ${esc(doc.label)} <span aria-hidden="true">&#8599;</span>
              </a>
            `
            )
            .join("")}
          <a href="https://www.nseindia.com/market-data/all-upcoming-issues-ipo" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:7px; border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; font-weight:700; font-size:0.84rem; text-decoration:none;">
            NSE Official IPO Portal <span aria-hidden="true">&#8599;</span>
          </a>
        </div>
      </div>
    `;

    return `
      <section id="ipo-research-detail-panel" role="region" aria-labelledby="ipo-research-heading" tabindex="-1" style="margin-top:20px; border-top:2px solid #0f172a; background:#ffffff; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 id="ipo-research-heading" style="margin:0; font-size:1.15rem; color:#0f172a; font-weight:800;">
              ${esc(item.companyName)}${item.symbol ? ` (${esc(item.symbol)})` : ""} — Official NSE IPO Research
            </h3>
            <p style="margin:4px 0 0 0; font-size:0.82rem; color:#475569;">Press Esc or select Close Research Details to return to the IPO list.</p>
          </div>
          <button type="button" id="btn-close-ipo-research" style="padding:8px 14px; border-radius:7px; border:1px solid #0f172a; background:#0f172a; color:#ffffff; font-weight:700; font-size:0.85rem; cursor:pointer;">
            Close Research Details
          </button>
        </div>

        <div>
          <h4 style="margin:0 0 10px 0; font-size:0.98rem; color:#0f172a; font-weight:800;">Issue Overview &amp; Application Rules</h4>
          <dl style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin:0;">
            ${kvItems.map(([k, v]) => buildKvCard(k, v)).join("")}
          </dl>
          ${r.issueStructure ? `<p style="margin:12px 0 0 0; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:0.85rem; color:#1e293b; line-height:1.5;"><strong>Offer Structure:</strong> ${esc(r.issueStructure)}</p>` : ""}
        </div>

        ${subscriptionHtml}

        <div style="margin-top:20px;">
          <h4 style="margin:0 0 10px 0; font-size:0.98rem; color:#0f172a; font-weight:800;">Lead Managers, Sponsor Bank &amp; Registrar</h4>
          <dl style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px; margin:0;">
            ${buildKvCard("Book Running Lead Managers", r.leadManagers)}
            ${buildKvCard("Sponsor Bank", r.sponsorBank)}
            ${buildKvCard("Registrar", r.registrarName)}
            ${buildKvCard("Registrar Contact", r.registrarContact)}
          </dl>
          ${r.registrarAddress ? `<p style="margin:10px 0 0 0; font-size:0.82rem; color:#475569;"><strong>Registrar Address:</strong> ${esc(r.registrarAddress)}</p>` : ""}
        </div>

        ${docHtml}
      </section>
    `;
  }

  function renderCurrentOrUpcomingTable(rows, emptyMsg, regionLabel, isOpenTab) {
    const colCount = isOpenTab ? 8 : 7;
    const bodyHtml =
      rows.length > 0
        ? rows
            .map((r, idx) => {
              const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
              const sym = r.symbol ? String(r.symbol).toUpperCase() : "";
              const nameCell = sym
                ? `<a href="index.html?symbol=${encodeURIComponent(sym)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(r.companyName)}</a><div style="font-size:0.76rem; color:#475569; font-weight:700;">${esc(sym)}</div>`
                : `<strong style="color:#0f172a;">${esc(r.companyName)}</strong>`;

              const lotVal = r.lotSize != null ? r.lotSize : r.research && r.research.lotSize;
              const minInv = r.minInvestment != null ? r.minInvestment : r.research && r.research.minInvestment;
              const lotHtml = lotVal
                ? `<div style="font-weight:700; color:#0f172a;">${esc(String(lotVal))} Shares</div>${minInv ? `<div style="font-size:0.76rem; color:#475569;">Min ${esc(fmtIntRs(minInv))}</div>` : ""}`
                : `<span style="color:#64748b;">--</span>`;

              const sizeHtml = r.issueSizeCr
                ? `<div style="font-weight:700; color:#0f172a;">${esc(fmtCr(r.issueSizeCr))}</div><div style="font-size:0.76rem; color:#475569;">${esc(r.issueSizeText)}</div>`
                : `<span style="color:#334155;">${esc(r.issueSizeText || "--")}</span>`;

              const subTimes = typeof r.totalSubscriptionTimes === "number" ? r.totalSubscriptionTimes : null;
              const subColor = subTimes != null && subTimes >= 1 ? "#15803d" : "#334155";
              const subCell = isOpenTab
                ? `<td style="padding:11px 12px; text-align:right; font-weight:800; color:${subColor}; white-space:nowrap;">${subTimes != null ? `${subTimes.toFixed(2)}x` : "--"}</td>`
                : "";

              const isExpanded = Boolean(sym && selectedResearchSymbol === sym);
              const hasResearch = Boolean(sym && (r.research || lotVal || r.series));
              const researchBtn = hasResearch
                ? `<button type="button" id="btn-ipo-research-${esc(sym)}" class="ipo-research-btn" data-ipo-symbol="${esc(sym)}" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="ipo-research-detail-panel" style="padding:6px 11px; border-radius:6px; border:1px solid ${isExpanded ? "#0f172a" : "#1d4ed8"}; background:${isExpanded ? "#0f172a" : "#eff6ff"}; color:${isExpanded ? "#ffffff" : "#1d4ed8"}; font-weight:700; font-size:0.8rem; cursor:pointer; white-space:nowrap;">${isExpanded ? "Hide Research" : "View Research Details"}</button>`
                : `<span style="color:#64748b;">--</span>`;

              return `
                <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
                  <td style="padding:11px 12px;">${nameCell}</td>
                  <td style="padding:11px 12px; color:#334155; white-space:nowrap;">${esc(formatBoardLabel(r.series))}</td>
                  <td style="padding:11px 12px; color:#0f172a; white-space:nowrap;">
                    <div>${esc(r.issueStartDate)}</div>
                    <div style="font-size:0.76rem; color:#475569;">to ${esc(r.issueEndDate)}</div>
                  </td>
                  <td style="padding:11px 12px; font-weight:700; color:#0f172a; white-space:nowrap;">${esc(r.issuePrice)}</td>
                  <td style="padding:11px 12px; white-space:nowrap;">${lotHtml}</td>
                  <td style="padding:11px 12px; text-align:right; white-space:nowrap;">${sizeHtml}</td>
                  ${subCell}
                  <td style="padding:11px 12px; text-align:right; white-space:nowrap;">${researchBtn}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="${colCount}" style="padding:24px; text-align:center; color:#64748b;">${esc(emptyMsg)}</td></tr>`;

    const selectedItem = selectedResearchSymbol
      ? rows.find((r) => r && String(r.symbol || "").toUpperCase() === selectedResearchSymbol)
      : null;

    return `
      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="${esc(regionLabel)}" style="overflow-x:auto;">
        <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.87rem; min-width:860px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.75rem; text-transform:uppercase;">
              <th scope="col" style="padding:10px 12px; text-align:left;">Company</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Board</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Open – Close</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Price Band</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Lot &amp; Min Invest</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">Issue Size</th>
              ${isOpenTab ? `<th scope="col" style="padding:10px 12px; text-align:right;">Subscription</th>` : ""}
              <th scope="col" style="padding:10px 12px; text-align:right;">Research</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
      ${selectedItem ? renderResearchDetailPanel(selectedItem) : ""}
    `;
  }

  function filterPastRows(rows) {
    const q = pastSearchQuery.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (!r) return false;
      const board = String(r.securityType || "EQ").toUpperCase();
      if (pastBoardFilter === "MAINBOARD" && board === "SME") return false;
      if (pastBoardFilter === "SME" && board !== "SME") return false;
      if (q) {
        const hay = `${r.symbol || ""} ${r.companyName || ""} ${r.sector || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function buildPastRowsHtml(visibleRows) {
    if (!visibleRows || visibleRows.length === 0) {
      return `<tr><td colspan="8" style="padding:24px; text-align:center; color:#64748b;">No matching recently listed IPO records found.</td></tr>`;
    }
    return visibleRows
      .map((r, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const gainColor = r.gainPct == null ? "#475569" : r.gainPct >= 0 ? "#15803d" : "#b91c1c";
        const symHtml = r.symbol
          ? `<a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(r.symbol)}</a>`
          : "--";
        const subMeta = [r.companyName, r.sector].filter(Boolean).join(" • ");
        const bidPeriod = r.ipoStartDate && r.ipoStartDate !== "--"
          ? `<div style="font-size:0.74rem; color:#475569;">Bid: ${esc(r.ipoStartDate)} – ${esc(r.ipoEndDate || "--")}</div>`
          : "";
        const priceBandSub = r.priceRange && r.priceRange !== "--"
          ? `<div style="font-size:0.74rem; color:#475569;">Band: ${esc(r.priceRange)}</div>`
          : "";
        const mcapText = typeof r.marketCapCr === "number" && r.marketCapCr > 0
          ? "₹ " + Math.round(r.marketCapCr).toLocaleString("en-IN")
          : "--";
        const peText = typeof r.pe === "number" && r.pe > 0 ? r.pe.toFixed(2) : "--";

        return `
          <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 12px;">
              ${symHtml}
              <div style="font-size:0.78rem; color:#475569;">${esc(subMeta)}</div>
            </td>
            <td style="padding:10px 12px; color:#334155; white-space:nowrap;">${esc(formatBoardLabel(r.securityType))}</td>
            <td style="padding:10px 12px; color:#0f172a; white-space:nowrap;">
              <div>${esc(r.listingDate)}</div>
              ${bidPeriod}
            </td>
            <td style="padding:10px 12px; text-align:right; color:#0f172a; font-weight:700; white-space:nowrap;">
              <div>${fmtPrice(r.issuePrice)}</div>
              ${priceBandSub}
            </td>
            <td style="padding:10px 12px; text-align:right; color:#0f172a; font-weight:700; white-space:nowrap;">${fmtPrice(r.cmp)}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:800; color:${gainColor}; white-space:nowrap;">${fmtPct(r.gainPct)}</td>
            <td style="padding:10px 12px; text-align:right; color:#0f172a; font-weight:600; white-space:nowrap;">${mcapText}</td>
            <td style="padding:10px 12px; text-align:right; color:#334155; font-weight:600; white-space:nowrap;">${peText}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildMoreWrapHtml(allPastRows, recentSixMonthRows) {
    if (!allPastRows || !recentSixMonthRows || allPastRows.length <= recentSixMonthRows.length) {
      return "";
    }
    if (pastShowAll) {
      return `<a href="#recent-listed-ipos" id="btn-ipo-past-show-all" style="display:inline-block; padding:8px 16px; border-radius:7px; border:1px solid #0f172a; background:#ffffff; color:#0f172a; font-weight:700; font-size:0.86rem; text-decoration:none;">Show Last 6 Months Only (${recentSixMonthRows.length})</a>`;
    }
    return `<a href="#all-listed-ipos" id="btn-ipo-past-show-all" style="display:inline-block; padding:8px 16px; border-radius:7px; border:1px solid #0f172a; background:#ffffff; color:#0f172a; font-weight:700; font-size:0.86rem; text-decoration:none;">View All Listed IPOs (${allPastRows.length})</a>`;
  }

  function buildPastCountText(filteredLen, baseLen, isAllMode) {
    return isAllMode
      ? `Showing ${filteredLen} of ${baseLen} all-time listed IPOs`
      : `Showing ${filteredLen} of ${baseLen} IPOs listed in the last 6 months`;
  }

  function updatePastTableBodyOnly(allPastRows, recentSixMonthRows) {
    const baseRows = pastShowAll ? allPastRows : recentSixMonthRows;
    const filtered = filterPastRows(baseRows);

    const tbody = typeof document !== "undefined" ? document.getElementById("ipo-past-tbody") : null;
    if (tbody) tbody.innerHTML = buildPastRowsHtml(filtered);

    const countEl = typeof document !== "undefined" ? document.getElementById("ipo-past-count") : null;
    if (countEl) {
      countEl.textContent = buildPastCountText(filtered.length, baseRows.length, pastShowAll);
    }

    const moreWrap = typeof document !== "undefined" ? document.getElementById("ipo-past-more-wrap") : null;
    if (moreWrap) {
      moreWrap.innerHTML = buildMoreWrapHtml(allPastRows, recentSixMonthRows);
      const moreLink = typeof document !== "undefined" ? document.getElementById("btn-ipo-past-show-all") : null;
      if (moreLink) {
        moreLink.addEventListener("click", function (e) {
          if (e && typeof e.preventDefault === "function") e.preventDefault();
          toggleShowAllPast();
        });
      }
    }
  }

  function renderPastTable(allPastRows, recentSixMonthRows) {
    const baseRows = pastShowAll ? allPastRows : recentSixMonthRows;
    const filtered = filterPastRows(baseRows);
    const boards = [
      { id: "ALL", label: "All Boards" },
      { id: "MAINBOARD", label: "Mainboard" },
      { id: "SME", label: "SME" }
    ];

    return `
      <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#ffffff; display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; justify-content:space-between;">
        <div style="flex:1; min-width:220px;">
          <label for="ipo-past-search" style="display:block; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:4px;">Search Recently Listed IPOs</label>
          <input type="search" id="ipo-past-search" value="${esc(pastSearchQuery)}" placeholder="Search by symbol, company, or sector..." style="width:100%; max-width:340px; padding:8px 11px; border:1px solid #cbd5e1; border-radius:7px; font-size:0.88rem; color:#0f172a;">
        </div>
        <div role="group" aria-label="Filter by Board" style="display:flex; gap:8px; flex-wrap:wrap;">
          ${boards
            .map((b) => {
              const pressed = pastBoardFilter === b.id;
              return `<button type="button" class="ipo-past-board-btn" data-board="${b.id}" aria-pressed="${pressed ? "true" : "false"}" style="padding:7px 13px; border-radius:7px; border:1px solid ${pressed ? "#0f172a" : "#cbd5e1"}; background:${pressed ? "#0f172a" : "#ffffff"}; color:${pressed ? "#ffffff" : "#334155"}; font-weight:700; font-size:0.84rem; cursor:pointer;">${esc(b.label)}</button>`;
            })
            .join("")}
        </div>
      </div>
      <div style="padding:8px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
        <p id="ipo-past-count" style="margin:0; font-size:0.8rem; color:#475569; font-weight:600;">
          ${esc(buildPastCountText(filtered.length, baseRows.length, pastShowAll))}
        </p>
      </div>
      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="Recently Listed IPOs Table" style="overflow-x:auto;">
        <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.87rem; min-width:860px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.75rem; text-transform:uppercase;">
              <th scope="col" style="padding:10px 12px; text-align:left;">Company</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Board</th>
              <th scope="col" style="padding:10px 12px; text-align:left;">Listing Date</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">Issue Price</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">Current CMP</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">Gain / Loss %</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">Market Cap (₹ Cr)</th>
              <th scope="col" style="padding:10px 12px; text-align:right;">P/E</th>
            </tr>
          </thead>
          <tbody id="ipo-past-tbody">${buildPastRowsHtml(filtered)}</tbody>
        </table>
      </div>
      <div id="ipo-past-more-wrap" style="padding:14px 16px; text-align:center; background:#f8fafc; border-top:1px solid #e2e8f0;">
        ${buildMoreWrapHtml(allPastRows, recentSixMonthRows)}
      </div>
    `;
  }

  function toggleShowAllPast(forceVal) {
    pastShowAll = typeof forceVal === "boolean" ? forceVal : !pastShowAll;
    renderIpoView("past");
    const data = getData();
    const allCount = data && Array.isArray(data.pastIpos) ? data.pastIpos.length : 0;
    announceA11y(pastShowAll ? `Showing all ${allCount} listed IPOs.` : "Showing IPOs listed in the last 6 months.");
  }

  function openResearchDetail(sym, triggerId) {
    const upper = String(sym || "").trim().toUpperCase();
    if (!upper) return;
    if (selectedResearchSymbol === upper) {
      closeResearchDetail();
      return;
    }
    const item = findItemInActiveTab(upper);
    selectedResearchSymbol = upper;
    lastResearchTriggerId = triggerId || `btn-ipo-research-${upper}`;
    renderIpoView(activeTab);

    const panel = typeof document !== "undefined" ? document.getElementById("ipo-research-detail-panel") : null;
    if (panel) {
      if (typeof panel.scrollIntoView === "function") panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (typeof panel.focus === "function") panel.focus();
    }
    if (item) {
      announceA11y(`Opened official NSE IPO research details for ${item.companyName}. Press Escape to close.`);
    }
  }

  function closeResearchDetail() {
    if (!selectedResearchSymbol) return;
    const returnId = lastResearchTriggerId || `btn-ipo-research-${selectedResearchSymbol}`;
    selectedResearchSymbol = null;
    lastResearchTriggerId = null;
    renderIpoView(activeTab);

    const btn = typeof document !== "undefined" ? document.getElementById(returnId) : null;
    if (btn && typeof btn.focus === "function") btn.focus();
    announceA11y("Closed IPO research details.");
  }

  function renderIpoView(tabName) {
    const nextTab = tabName || "open";
    if (nextTab !== activeTab) {
      selectedResearchSymbol = null;
      lastResearchTriggerId = null;
    }
    activeTab = nextTab;

    const root = typeof document !== "undefined" ? document.getElementById("ipo-tracker-root") : null;
    const data = getData();
    if (!root) return;

    const hintEl = typeof document !== "undefined" ? document.getElementById("ipo-updated-hint") : null;
    if (hintEl && data && data.updatedAt) {
      hintEl.textContent = formatUpdatedHint(data.updatedAt);
    }

    if (!data) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">IPO data is currently unavailable.</div>`;
      return;
    }

    const openRows = Array.isArray(data.openIpos) ? data.openIpos : [];
    const upcomingRows = Array.isArray(data.upcomingIpos) ? data.upcomingIpos : [];
    const pastRows = Array.isArray(data.pastIpos) ? data.pastIpos : [];
    const recentSixMonthRows = getSixMonthListedIpos(pastRows, data.updatedAt);

    const tabs = [
      { id: "open", label: `Open IPOs ${openRows.length}` },
      { id: "upcoming", label: `Upcoming IPOs ${upcomingRows.length}` },
      { id: "past", label: `Recently Listed IPOs ${recentSixMonthRows.length}` }
    ];

    let panelHtml = "";
    let panelTitle = "";
    if (activeTab === "upcoming") {
      panelTitle = "Upcoming NSE IPOs";
      panelHtml = renderCurrentOrUpcomingTable(upcomingRows, "No upcoming IPOs scheduled on NSE right now.", panelTitle, false);
    } else if (activeTab === "past") {
      panelTitle = "Recently Listed IPOs Performance";
      panelHtml = renderPastTable(pastRows, recentSixMonthRows);
    } else {
      panelTitle = "Open / Live NSE IPOs";
      panelHtml = renderCurrentOrUpcomingTable(openRows, "No IPO issues are currently open on NSE.", panelTitle, true);
    }

    root.innerHTML = `
      <nav aria-label="IPO Categories" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
        ${tabs
          .map((t) => {
            const isSel = activeTab === t.id;
            return `
              <a
                href="#ipo-${t.id}"
                id="ipo-tab-${t.id}"
                ${isSel ? 'aria-current="true"' : ""}
                data-tab="${t.id}"
                style="display:inline-block; padding:9px 16px; border-radius:8px; border:1px solid ${isSel ? "#0f172a" : "#cbd5e1"}; background:${isSel ? "#0f172a" : "#ffffff"}; color:${isSel ? "#ffffff" : "#334155"}; font-weight:700; font-size:0.9rem; text-decoration:none; cursor:pointer;"
              >
                ${esc(t.label)}
              </a>
            `;
          })
          .join("")}
      </nav>

      <div id="ipo-panel-box" role="region" aria-labelledby="ipo-section-heading" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
          <h2 id="ipo-section-heading" tabindex="-1" style="margin:0; font-size:1.12rem; color:#0f172a; font-weight:800;">${esc(panelTitle)}</h2>
        </div>
        ${panelHtml}
      </div>
    `;

    if (typeof root.querySelectorAll === "function") {
      root.querySelectorAll("[data-tab]").forEach((linkEl) => {
        linkEl.addEventListener("click", function (e) {
          if (e && typeof e.preventDefault === "function") e.preventDefault();
          const next = this.getAttribute("data-tab");
          renderIpoView(next);
          const spoken = next === "past" ? "recently listed IPOs" : `${next} IPOs`;
          announceA11y(`Showing ${spoken}.`);
        });
      });

      root.querySelectorAll(".ipo-research-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const sym = this.getAttribute("data-ipo-symbol");
          openResearchDetail(sym, this.id);
        });
      });

      root.querySelectorAll(".ipo-past-board-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const b = this.getAttribute("data-board") || "ALL";
          pastBoardFilter = b;
          root.querySelectorAll(".ipo-past-board-btn").forEach((other) => {
            const on = (other.getAttribute("data-board") || "ALL") === b;
            other.setAttribute("aria-pressed", on ? "true" : "false");
            other.style.background = on ? "#0f172a" : "#ffffff";
            other.style.color = on ? "#ffffff" : "#334155";
            other.style.borderColor = on ? "#0f172a" : "#cbd5e1";
          });
          updatePastTableBodyOnly(pastRows, recentSixMonthRows);
          announceA11y(`Filtered recently listed IPOs by ${b}.`);
        });
      });
    }

    const closeBtn = typeof document !== "undefined" ? document.getElementById("btn-close-ipo-research") : null;
    if (closeBtn) {
      closeBtn.addEventListener("click", closeResearchDetail);
    }

    const pastSearch = typeof document !== "undefined" ? document.getElementById("ipo-past-search") : null;
    if (pastSearch) {
      pastSearch.addEventListener("input", function () {
        pastSearchQuery = this.value || "";
        updatePastTableBodyOnly(pastRows, recentSixMonthRows);
      });
    }

    const showAllLink = typeof document !== "undefined" ? document.getElementById("btn-ipo-past-show-all") : null;
    if (showAllLink) {
      showAllLink.addEventListener("click", function (e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        toggleShowAllPast();
      });
    }

    if (!escapeBound && typeof document !== "undefined" && typeof document.addEventListener === "function") {
      escapeBound = true;
      document.addEventListener("keydown", function (e) {
        if ((e.key === "Escape" || e.key === "Esc") && selectedResearchSymbol) {
          e.preventDefault();
          closeResearchDetail();
        }
      });
    }
  }

  function init() {
    renderIpoView("open");
  }

  if (typeof window !== "undefined") {
    window.StocksIpoTracker = { renderIpoView, openResearchDetail, closeResearchDetail, toggleShowAllPast };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
