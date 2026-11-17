/**
 * Stocks 360 - Official NSE Bulk & Block Deals Controller (deals.js)
 * Renders verified exchange institutional Bulk & Block Deals on deals.html
 * and as a compact preview section above the Stock Screener on screener.html.
 */

const StocksDeals = (function () {
  const DEALS_URL = "data/market/bulk-block-deals.json?v=62";

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNumber(n, digits = 0) {
    const val = Number(n);
    if (!isFinite(val)) return "--";
    return val.toLocaleString("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  async function fetchDealsData() {
    try {
      const res = await fetch(DEALS_URL);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function buildDealRowHtml(d, idx) {
    const isBuy = d.side === "BUY";
    const sideBg = isBuy ? "#f0fdf4" : "#fef2f2";
    const sideColor = isBuy ? "#16a34a" : "#dc2626";
    const sideBorder = isBuy ? "#bbf7d0" : "#fecaca";
    const typeBg = d.dealType === "BLOCK" ? "#eff6ff" : "#f8fafc";
    const typeColor = d.dealType === "BLOCK" ? "#1d4ed8" : "#334155";
    const typeBorder = d.dealType === "BLOCK" ? "#bfdbfe" : "#cbd5e1";

    return `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 12px; color:#475569; white-space:nowrap; font-size:0.84rem;">${escapeHtml(d.date)}</td>
        <td style="padding:10px 12px; white-space:nowrap;">
          <span style="display:inline-block; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:4px; background:${typeBg}; color:${typeColor}; border:1px solid ${typeBorder};">
            ${escapeHtml(d.dealType || "BULK")}
          </span>
        </td>
        <td style="padding:10px 12px;">
          <a href="index.html?symbol=${encodeURIComponent(d.symbol)}" style="color:#2563eb; font-weight:700; text-decoration:none;">
            ${escapeHtml(d.symbol)}
          </a>
          <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(d.companyName)}</div>
        </td>
        <td style="padding:10px 12px; color:#1e293b; font-size:0.86rem; max-width:280px;">${escapeHtml(d.clientName)}</td>
        <td style="padding:10px 12px; white-space:nowrap;">
          <span style="display:inline-block; font-size:0.76rem; font-weight:700; padding:3px 9px; border-radius:4px; background:${sideBg}; color:${sideColor}; border:1px solid ${sideBorder};">
            ${escapeHtml(d.side)}
          </span>
        </td>
        <td style="padding:10px 12px; text-align:right; color:#0f172a; font-weight:600; white-space:nowrap;">${formatNumber(d.quantity, 0)}</td>
        <td style="padding:10px 12px; text-align:right; color:#334155; white-space:nowrap;">₹ ${formatNumber(d.price, 2)}</td>
        <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0f172a; white-space:nowrap;">₹ ${formatNumber(d.valueCr, 2)} Cr</td>
      </tr>
    `;
  }

  function renderFullDealsPage(root, payload) {
    if (!payload || !Array.isArray(payload.deals)) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">Official NSE Bulk &amp; Block Deals feed is currently unavailable. Please check again after market reconciliation at 6:45 PM IST.</div>`;
      return;
    }

    const summary = payload.summary || {};
    let filterType = "ALL";
    let filterSide = "ALL";
    let searchQuery = "";

    root.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Latest Session Date</div>
          <strong style="font-size:1.15rem; color:#0f172a;">${escapeHtml(payload.latestTradeDate || "--")}</strong>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
          <div style="font-size:0.8rem; color:#64748b; margin-bottom:4px;">Session Deals (Bulk / Block)</div>
          <strong style="font-size:1.15rem; color:#0f172a;">${formatNumber(summary.latestDateDeals || 0)} (${formatNumber(summary.bulkCount || 0)} / ${formatNumber(summary.blockCount || 0)})</strong>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px 16px;">
          <div style="font-size:0.8rem; color:#15803d; margin-bottom:4px;">Total Buy Value (${formatNumber(summary.buyDealsCount || 0)} deals)</div>
          <strong style="font-size:1.15rem; color:#16a34a;">₹ ${formatNumber(summary.buyValueCr || 0, 2)} Cr</strong>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px 16px;">
          <div style="font-size:0.8rem; color:#b91c1c; margin-bottom:4px;">Total Sell Value (${formatNumber(summary.sellDealsCount || 0)} deals)</div>
          <strong style="font-size:1.15rem; color:#dc2626;">₹ ${formatNumber(summary.sellValueCr || 0, 2)} Cr</strong>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; margin-bottom:18px;">
        <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
          <div style="flex:1; min-width:240px;">
            <label for="deals-filter-input" class="sr-only">Filter deals by stock symbol, company name, or client</label>
            <input type="search" id="deals-filter-input" class="form-input" placeholder="Search symbol, company, or institutional client (e.g. KAYNES, GRAVITON)..." style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px;">
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <select id="deals-type-select" aria-label="Filter by Deal Type" style="padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; background:#f8fafc;">
              <option value="ALL">All Deals (Bulk + Block)</option>
              <option value="BULK">Bulk Deals Only</option>
              <option value="BLOCK">Block Deals Only</option>
            </select>
            <select id="deals-side-select" aria-label="Filter by Buy or Sell" style="padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; background:#f8fafc;">
              <option value="ALL">Buy &amp; Sell</option>
              <option value="BUY">Buy Only</option>
              <option value="SELL">Sell Only</option>
            </select>
            <button type="button" id="btn-read-deals-aloud" class="btn-secondary">Read Summary Aloud</button>
          </div>
        </div>
        <div id="deals-match-meta" style="margin-top:10px; font-size:0.84rem; color:#64748b;"></div>
      </div>

      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="NSE Bulk and Block Deals Table" style="overflow-x:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
        <table id="deals-data-table" class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.9rem; min-width:860px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; text-align:left;">
              <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Date</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Type</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Stock</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Client / Institution Name</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Side</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Quantity</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Avg Price (₹)</th>
              <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Deal Value</th>
            </tr>
          </thead>
          <tbody id="deals-table-body"></tbody>
        </table>
      </div>
    `;

    function updateTable() {
      const q = searchQuery.trim().toLowerCase();
      const filtered = payload.deals.filter((d) => {
        if (filterType !== "ALL" && d.dealType !== filterType) return false;
        if (filterSide !== "ALL" && d.side !== filterSide) return false;
        if (q) {
          const hay = `${d.symbol} ${d.companyName} ${d.clientName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const tbody = document.getElementById("deals-table-body");
      const meta = document.getElementById("deals-match-meta");
      if (meta) {
        meta.textContent = `Showing ${Math.min(filtered.length, 300)} of ${filtered.length} official NSE deals (Last updated: ${payload.lastUpdated || "--"}).`;
      }
      if (!tbody) return;
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:28px; text-align:center; color:#64748b;">No deals match your current search or filter criteria.</td></tr>`;
        return;
      }
      tbody.innerHTML = filtered.slice(0, 300).map((d, i) => buildDealRowHtml(d, i)).join("");
    }

    const inputEl = document.getElementById("deals-filter-input");
    const typeEl = document.getElementById("deals-type-select");
    const sideEl = document.getElementById("deals-side-select");
    const audioEl = document.getElementById("btn-read-deals-aloud");

    if (inputEl) {
      inputEl.addEventListener("input", function () {
        searchQuery = this.value;
        updateTable();
      });
    }
    if (typeEl) {
      typeEl.addEventListener("change", function () {
        filterType = this.value;
        updateTable();
      });
    }
    if (sideEl) {
      sideEl.addEventListener("change", function () {
        filterSide = this.value;
        updateTable();
      });
    }
    if (audioEl) {
      audioEl.addEventListener("click", () => {
        const top = payload.deals.slice(0, 3).map((d) => `${d.clientName} ${d.side.toLowerCase()} ${d.symbol} worth ${d.valueCr} crore rupees`).join(". ");
        const text = `Latest NSE Bulk and Block deals for ${payload.latestTradeDate}. Total ${summary.latestDateDeals || 0} institutional deals recorded. Top deals include: ${top}.`;
        if (typeof window.speakWithPitch === "function") {
          window.speakWithPitch(text, true);
        } else if ("speechSynthesis" in window) {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        }
      });
    }

    updateTable();
  }

  function renderScreenerDealsPreview(root, payload) {
    if (!payload || !Array.isArray(payload.deals) || payload.deals.length === 0) return;

    const summary = payload.summary || {};
    const topDeals = payload.deals.slice(0, 6);

    root.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
                NSE Official (${escapeHtml(payload.latestTradeDate || "Latest")})
              </span>
              <h2 style="font-size:1.15rem; color:#0f172a; margin:0; font-weight:700;">Bulk &amp; Block Deals</h2>
            </div>
            <p style="margin:4px 0 0 0; font-size:0.86rem; color:#64748b;">
              ${formatNumber(summary.latestDateDeals || 0)} deals (${formatNumber(summary.bulkCount || 0)} Bulk, ${formatNumber(summary.blockCount || 0)} Block) &bull; Buy Value: ₹ ${formatNumber(summary.buyValueCr || 0, 2)} Cr &bull; Sell Value: ₹ ${formatNumber(summary.sellValueCr || 0, 2)} Cr
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button type="button" id="btn-toggle-screener-deals" class="btn-secondary" aria-expanded="false" aria-controls="screener-deals-collapse" style="font-size:0.86rem; padding:7px 14px;">
              Show Top Deals
            </button>
            <a href="deals.html" class="btn-primary" style="font-size:0.86rem; padding:7px 14px; text-decoration:none;">
              View All Deals &rarr;
            </a>
          </div>
        </div>

        <div id="screener-deals-collapse" hidden style="margin-top:14px; overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
          <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:760px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
                <th style="padding:9px 12px; font-weight:700;">Date</th>
                <th style="padding:9px 12px; font-weight:700;">Type</th>
                <th style="padding:9px 12px; font-weight:700;">Stock</th>
                <th style="padding:9px 12px; font-weight:700;">Client / Institution</th>
                <th style="padding:9px 12px; font-weight:700;">Side</th>
                <th style="padding:9px 12px; font-weight:700; text-align:right;">Quantity</th>
                <th style="padding:9px 12px; font-weight:700; text-align:right;">Avg Price (₹)</th>
                <th style="padding:9px 12px; font-weight:700; text-align:right;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${topDeals.map((d, i) => buildDealRowHtml(d, i)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const toggleBtn = document.getElementById("btn-toggle-screener-deals");
    const box = document.getElementById("screener-deals-collapse");
    if (toggleBtn && box) {
      toggleBtn.addEventListener("click", () => {
        const isHidden = box.hidden;
        box.hidden = !isHidden;
        toggleBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
        toggleBtn.textContent = isHidden ? "Hide Top Deals" : "Show Top Deals";
      });
    }
  }

  async function init() {
    const pageRoot = document.getElementById("deals-page-root");
    const previewRoot = document.getElementById("screener-deals-preview-root");
    if (!pageRoot && !previewRoot) return;

    const payload = await fetchDealsData();
    if (pageRoot) renderFullDealsPage(pageRoot, payload);
    if (previewRoot) renderScreenerDealsPreview(previewRoot, payload);
  }

  document.addEventListener("DOMContentLoaded", init);
  return { init, renderFullDealsPage, renderScreenerDealsPreview };
})();

if (typeof window !== "undefined") {
  window.StocksDeals = StocksDeals;
}
