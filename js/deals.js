/**
 * Stocks 360 - Official NSE Bulk & Block Deals Controller (deals.js)
 * Renders verified exchange institutional Bulk & Block Deals on deals.html
 * and as a compact preview section above the Stock Screener on screener.html.
 * Supports 5 Deal Conviction Combo Box modes:
 *   All Deals | Only Buying | Only Selling | Net Buying | Net Selling
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

  // Formula engine: groups deals by (date, symbol), nets HFT round-trips at client & stock levels
  function computeNetDealsByStock(deals, mode) {
    const byStock = new Map();
    for (const d of deals || []) {
      const k = `${d.date}|${d.symbol}`;
      if (!byStock.has(k)) {
        byStock.set(k, {
          date: d.date,
          symbol: d.symbol,
          companyName: d.companyName,
          dealTypes: new Set(),
          buyQty: 0,
          sellQty: 0,
          buyAmt: 0,
          sellAmt: 0,
          buyDeals: 0,
          sellDeals: 0,
          clients: new Map()
        });
      }
      const g = byStock.get(k);
      g.dealTypes.add(d.dealType || "BULK");
      if (!g.clients.has(d.clientName)) {
        g.clients.set(d.clientName, { clientName: d.clientName, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
      }
      const c = g.clients.get(d.clientName);
      const qty = Number(d.quantity) || 0;
      const price = Number(d.price) || 0;
      const amt = qty * price;
      if (d.side === "SELL") {
        g.sellQty += qty;
        g.sellAmt += amt;
        g.sellDeals++;
        c.sellQty += qty;
        c.sellAmt += amt;
      } else {
        g.buyQty += qty;
        g.buyAmt += amt;
        g.buyDeals++;
        c.buyQty += qty;
        c.buyAmt += amt;
      }
    }

    const rows = Array.from(byStock.values()).map((g) => {
      const netQty = g.buyQty - g.sellQty;
      const buyValueCr = Number((g.buyAmt / 10000000).toFixed(2));
      const sellValueCr = Number((g.sellAmt / 10000000).toFixed(2));
      const netValueCr = Number((buyValueCr - sellValueCr).toFixed(2));
      let pureBuyersCount = 0;
      let pureSellersCount = 0;
      let topNetBuyer = null;
      let topNetSeller = null;

      for (const c of g.clients.values()) {
        const cNetQty = c.buyQty - c.sellQty;
        const cNetValCr = Number(((c.buyAmt - c.sellAmt) / 10000000).toFixed(2));
        if (cNetQty > 0) {
          pureBuyersCount++;
          if (!topNetBuyer || cNetQty > topNetBuyer.netQty) {
            topNetBuyer = { clientName: c.clientName, netQty: cNetQty, netValueCr: cNetValCr };
          }
        } else if (cNetQty < 0) {
          pureSellersCount++;
          if (!topNetSeller || cNetQty < topNetSeller.netQty) {
            topNetSeller = { clientName: c.clientName, netQty: cNetQty, netValueCr: cNetValCr };
          }
        }
      }

      return {
        date: g.date,
        dealType: Array.from(g.dealTypes).join("+"),
        symbol: g.symbol,
        companyName: g.companyName,
        buyQty: g.buyQty,
        sellQty: g.sellQty,
        buyValueCr,
        sellValueCr,
        avgBuyPrice: g.buyQty > 0 ? Number((g.buyAmt / g.buyQty).toFixed(2)) : 0,
        avgSellPrice: g.sellQty > 0 ? Number((g.sellAmt / g.sellQty).toFixed(2)) : 0,
        netQty,
        netValueCr,
        pureBuyersCount,
        pureSellersCount,
        topNetBuyer,
        topNetSeller
      };
    });

    if (mode === "NET_BUYING") {
      return rows
        .filter((r) => r.netQty > 0 && r.netValueCr > 0)
        .sort((a, b) => b.netValueCr - a.netValueCr);
    }
    if (mode === "NET_SELLING") {
      return rows
        .filter((r) => r.netQty < 0 && r.netValueCr < 0)
        .sort((a, b) => Math.abs(b.netValueCr) - Math.abs(a.netValueCr));
    }
    return rows;
  }

  function renderDealsTableHeaders(isNetMode) {
    if (isNetMode) {
      return `
        <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; text-align:left;">
          <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Date</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Type</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Stock</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b;">Lead Net Institution (Client Net)</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Gross Buy</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Gross Sell</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Wght. Avg Price (₹)</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Net Qty</th>
          <th style="padding:11px 12px; font-weight:700; color:#1e293b; text-align:right;">Net Value</th>
        </tr>
      `;
    }
    return `
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
    `;
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

  function buildNetRowHtml(r, idx, mode) {
    const isNetBuy = mode === "NET_BUYING";
    const netColor = isNetBuy ? "#16a34a" : "#dc2626";
    const netBg = isNetBuy ? "#f0fdf4" : "#fef2f2";
    const leadClient = isNetBuy ? r.topNetBuyer : r.topNetSeller;
    const leadLabel = leadClient
      ? `${escapeHtml(leadClient.clientName)} (${leadClient.netValueCr >= 0 ? "+" : "-"}₹ ${formatNumber(Math.abs(leadClient.netValueCr), 2)} Cr)`
      : "--";
    const wghtPrice = isNetBuy ? r.avgBuyPrice : r.avgSellPrice;

    return `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 12px; color:#475569; white-space:nowrap; font-size:0.84rem;">${escapeHtml(r.date)}</td>
        <td style="padding:10px 12px; white-space:nowrap;">
          <span style="display:inline-block; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:4px; background:#f8fafc; color:#334155; border:1px solid #cbd5e1;">
            ${escapeHtml(r.dealType || "BULK")}
          </span>
        </td>
        <td style="padding:10px 12px;">
          <a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="color:#2563eb; font-weight:700; text-decoration:none;">
            ${escapeHtml(r.symbol)}
          </a>
          <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(r.companyName)}</div>
        </td>
        <td style="padding:10px 12px; color:#1e293b; font-size:0.84rem; max-width:260px;">
          <div>${leadLabel}</div>
          <div style="font-size:0.75rem; color:#64748b;">Net Buyers: ${r.pureBuyersCount} &bull; Net Sellers: ${r.pureSellersCount}</div>
        </td>
        <td style="padding:10px 12px; text-align:right; color:#15803d; font-size:0.84rem; white-space:nowrap;">
          <div>${formatNumber(r.buyQty, 0)}</div>
          <div style="font-size:0.75rem;">₹ ${formatNumber(r.buyValueCr, 2)} Cr</div>
        </td>
        <td style="padding:10px 12px; text-align:right; color:#b91c1c; font-size:0.84rem; white-space:nowrap;">
          <div>${formatNumber(r.sellQty, 0)}</div>
          <div style="font-size:0.75rem;">₹ ${formatNumber(r.sellValueCr, 2)} Cr</div>
        </td>
        <td style="padding:10px 12px; text-align:right; color:#334155; white-space:nowrap;">₹ ${formatNumber(wghtPrice, 2)}</td>
        <td style="padding:10px 12px; text-align:right; font-weight:700; color:${netColor}; white-space:nowrap;">
          ${r.netQty >= 0 ? "+" : "-"}${formatNumber(Math.abs(r.netQty), 0)}
        </td>
        <td style="padding:10px 12px; text-align:right; font-weight:800; color:${netColor}; background:${netBg}; white-space:nowrap;">
          ${r.netValueCr >= 0 ? "+" : "-"}₹ ${formatNumber(Math.abs(r.netValueCr), 2)} Cr
        </td>
      </tr>
    `;
  }

  function getFormulaBannerHtml(mode) {
    if (mode === "NET_BUYING") {
      return `<strong>Net Buying Conviction Formula:</strong> Sums all institutional buys minus sells per stock &rarr; <code>Net Qty = Σ Buy Qty - Σ Sell Qty (&gt; 0)</code> and <code>Net Value = Σ Buy Value - Σ Sell Value (&gt; 0)</code>, neutralizing intraday two-way HFT flips to highlight real accumulation.`;
    }
    if (mode === "NET_SELLING") {
      return `<strong>Net Selling Conviction Formula:</strong> Sums all institutional buys minus sells per stock &rarr; <code>Net Qty = Σ Buy Qty - Σ Sell Qty (&lt; 0)</code> and <code>Net Value = Σ Buy Value - Σ Sell Value (&lt; 0)</code>, neutralizing intraday two-way HFT flips to highlight real distribution.`;
    }
    return "";
  }

  function renderFullDealsPage(root, payload) {
    if (!payload || !Array.isArray(payload.deals)) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">Official NSE Bulk &amp; Block Deals feed is currently unavailable. Please check again after market reconciliation at 6:45 PM IST.</div>`;
      return;
    }

    const summary = payload.summary || {};
    let filterType = "ALL";
    let convictionMode = "ALL";
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
          <div style="font-size:0.8rem; color:#15803d; margin-bottom:4px;">Gross Buy Value (${formatNumber(summary.buyDealsCount || 0)} deals)</div>
          <strong style="font-size:1.15rem; color:#16a34a;">₹ ${formatNumber(summary.buyValueCr || 0, 2)} Cr</strong>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px 16px;">
          <div style="font-size:0.8rem; color:#b91c1c; margin-bottom:4px;">Gross Sell Value (${formatNumber(summary.sellDealsCount || 0)} deals)</div>
          <strong style="font-size:1.15rem; color:#dc2626;">₹ ${formatNumber(summary.sellValueCr || 0, 2)} Cr</strong>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; margin-bottom:16px;">
        <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; justify-content:space-between;">
          <div style="min-width:220px;">
            <label for="deals-conviction-select" style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:5px;">
              Deal View / Conviction Filter
            </label>
            <select id="deals-conviction-select" aria-label="Select Bulk and Block Deals view" style="width:100%; padding:10px 14px; border:2px solid #2563eb; border-radius:8px; font-weight:700; background:#eff6ff; color:#1e3a8a; font-size:0.93rem;">
              <option value="ALL" selected>All Deals</option>
              <option value="ONLY_BUYING">Only Buying</option>
              <option value="ONLY_SELLING">Only Selling</option>
              <option value="NET_BUYING">Net Buying</option>
              <option value="NET_SELLING">Net Selling</option>
            </select>
          </div>

          <div style="flex:1; min-width:230px;">
            <label for="deals-filter-input" style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:5px;">
              Search Stock or Institutional Client
            </label>
            <input type="search" id="deals-filter-input" class="form-input" placeholder="e.g. KAYNES, STYLEBAAZA, GRAVITON..." style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px;">
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <select id="deals-type-select" aria-label="Filter by Deal Type" style="padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; background:#f8fafc;">
              <option value="ALL">All Types (Bulk + Block)</option>
              <option value="BULK">Bulk Deals Only</option>
              <option value="BLOCK">Block Deals Only</option>
            </select>
            <button type="button" id="btn-read-deals-aloud" class="btn-secondary" style="padding:10px 14px;">Read Summary Aloud</button>
          </div>
        </div>

        <div id="deals-formula-banner" hidden style="margin-top:12px; padding:10px 14px; border-radius:8px; background:#eff6ff; border:1px solid #bfdbfe; color:#1e3a8a; font-size:0.86rem; line-height:1.5;"></div>
        <div id="deals-match-meta" style="margin-top:10px; font-size:0.84rem; color:#64748b;"></div>
      </div>

      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="NSE Bulk and Block Deals Table" style="overflow-x:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
        <table id="deals-data-table" class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.9rem; min-width:880px;">
          <thead id="deals-table-head"></thead>
          <tbody id="deals-table-body"></tbody>
        </table>
      </div>
    `;

    function updateTable() {
      const q = searchQuery.trim().toLowerCase();
      const typeFiltered = payload.deals.filter((d) => filterType === "ALL" || d.dealType === filterType);
      const isNetMode = convictionMode === "NET_BUYING" || convictionMode === "NET_SELLING";

      const thead = document.getElementById("deals-table-head");
      const tbody = document.getElementById("deals-table-body");
      const meta = document.getElementById("deals-match-meta");
      const formulaBanner = document.getElementById("deals-formula-banner");

      if (thead) thead.innerHTML = renderDealsTableHeaders(isNetMode);
      if (formulaBanner) {
        if (isNetMode) {
          formulaBanner.hidden = false;
          formulaBanner.innerHTML = getFormulaBannerHtml(convictionMode);
        } else {
          formulaBanner.hidden = true;
          formulaBanner.innerHTML = "";
        }
      }

      if (isNetMode) {
        const netRows = computeNetDealsByStock(typeFiltered, convictionMode).filter((r) => {
          if (!q) return true;
          const buyerName = r.topNetBuyer ? r.topNetBuyer.clientName : "";
          const sellerName = r.topNetSeller ? r.topNetSeller.clientName : "";
          return `${r.symbol} ${r.companyName} ${buyerName} ${sellerName}`.toLowerCase().includes(q);
        });
        const totalNetCr = netRows.reduce((acc, r) => acc + Math.abs(r.netValueCr), 0);
        if (meta) {
          const modeLabel = convictionMode === "NET_BUYING" ? "Net Buying" : "Net Selling";
          meta.textContent = `Showing ${netRows.length} ${modeLabel} stocks (Aggregate Net Conviction: ₹ ${formatNumber(totalNetCr, 2)} Cr • Last updated: ${payload.lastUpdated || "--"}).`;
        }
        if (tbody) {
          if (netRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="padding:28px; text-align:center; color:#64748b;">No stocks match this ${convictionMode === "NET_BUYING" ? "Net Buying" : "Net Selling"} filter.</td></tr>`;
          } else {
            tbody.innerHTML = netRows.slice(0, 300).map((r, i) => buildNetRowHtml(r, i, convictionMode)).join("");
          }
        }
        return;
      }

      const filtered = typeFiltered.filter((d) => {
        if (convictionMode === "ONLY_BUYING" && d.side !== "BUY") return false;
        if (convictionMode === "ONLY_SELLING" && d.side !== "SELL") return false;
        if (q) {
          const hay = `${d.symbol} ${d.companyName} ${d.clientName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

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

    const convictionEl = document.getElementById("deals-conviction-select");
    const inputEl = document.getElementById("deals-filter-input");
    const typeEl = document.getElementById("deals-type-select");
    const audioEl = document.getElementById("btn-read-deals-aloud");

    if (convictionEl) {
      convictionEl.addEventListener("change", function () {
        convictionMode = this.value;
        updateTable();
      });
    }
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
    if (audioEl) {
      audioEl.addEventListener("click", () => {
        const isNetMode = convictionMode === "NET_BUYING" || convictionMode === "NET_SELLING";
        let text = "";
        if (isNetMode) {
          const rows = computeNetDealsByStock(payload.deals, convictionMode).slice(0, 3);
          const desc = rows.map((r) => `${r.symbol} with net ${convictionMode === "NET_BUYING" ? "buying" : "selling"} of ${Math.abs(r.netValueCr)} crore rupees`).join(", ");
          text = `Showing ${convictionMode === "NET_BUYING" ? "Net Buying" : "Net Selling"} conviction stocks for ${payload.latestTradeDate}. Top conviction stocks include ${desc}.`;
        } else {
          const top = payload.deals.slice(0, 3).map((d) => `${d.clientName} ${d.side.toLowerCase()} ${d.symbol} worth ${d.valueCr} crore rupees`).join(". ");
          text = `Latest NSE Bulk and Block deals for ${payload.latestTradeDate}. Total ${summary.latestDateDeals || 0} institutional deals recorded. Top deals include: ${top}.`;
        }
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
    let previewMode = "ALL";

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
              ${formatNumber(summary.latestDateDeals || 0)} deals &bull; Net Buying Stocks: <strong>${formatNumber(summary.netBuyingStocksCount || 0)}</strong> &bull; Net Selling Stocks: <strong>${formatNumber(summary.netSellingStocksCount || 0)}</strong>
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="screener-deals-conviction-select" aria-label="Deals Conviction View" style="padding:7px 12px; border:1px solid #2563eb; border-radius:7px; font-weight:700; background:#eff6ff; color:#1e3a8a; font-size:0.85rem;">
              <option value="ALL" selected>All Deals</option>
              <option value="ONLY_BUYING">Only Buying</option>
              <option value="ONLY_SELLING">Only Selling</option>
              <option value="NET_BUYING">Net Buying</option>
              <option value="NET_SELLING">Net Selling</option>
            </select>
            <button type="button" id="btn-toggle-screener-deals" class="btn-secondary" aria-expanded="false" aria-controls="screener-deals-collapse" style="font-size:0.86rem; padding:7px 14px;">
              Show Deals
            </button>
            <a href="deals.html" class="btn-primary" style="font-size:0.86rem; padding:7px 14px; text-decoration:none;">
              Full Deals Page &rarr;
            </a>
          </div>
        </div>

        <div id="screener-deals-collapse" hidden style="margin-top:14px;">
          <div id="screener-deals-formula-note" hidden style="margin-bottom:10px; padding:8px 12px; border-radius:6px; background:#eff6ff; border:1px solid #bfdbfe; color:#1e3a8a; font-size:0.82rem;"></div>
          <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
            <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:780px;">
              <thead id="screener-deals-head"></thead>
              <tbody id="screener-deals-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    function updatePreviewTable() {
      const isNet = previewMode === "NET_BUYING" || previewMode === "NET_SELLING";
      const thead = document.getElementById("screener-deals-head");
      const tbody = document.getElementById("screener-deals-body");
      const noteEl = document.getElementById("screener-deals-formula-note");
      if (thead) thead.innerHTML = renderDealsTableHeaders(isNet);
      if (noteEl) {
        if (isNet) {
          noteEl.hidden = false;
          noteEl.innerHTML = getFormulaBannerHtml(previewMode);
        } else {
          noteEl.hidden = true;
          noteEl.innerHTML = "";
        }
      }
      if (!tbody) return;
      if (isNet) {
        const netRows = computeNetDealsByStock(payload.deals, previewMode).slice(0, 8);
        tbody.innerHTML = netRows.length
          ? netRows.map((r, i) => buildNetRowHtml(r, i, previewMode)).join("")
          : `<tr><td colspan="9" style="padding:18px; text-align:center; color:#64748b;">No stocks found.</td></tr>`;
        return;
      }
      const rows = payload.deals.filter((d) => {
        if (previewMode === "ONLY_BUYING") return d.side === "BUY";
        if (previewMode === "ONLY_SELLING") return d.side === "SELL";
        return true;
      }).slice(0, 8);
      tbody.innerHTML = rows.map((d, i) => buildDealRowHtml(d, i)).join("");
    }

    const toggleBtn = document.getElementById("btn-toggle-screener-deals");
    const box = document.getElementById("screener-deals-collapse");
    const convSelect = document.getElementById("screener-deals-conviction-select");

    if (convSelect) {
      convSelect.addEventListener("change", function () {
        previewMode = this.value;
        updatePreviewTable();
        if (box && box.hidden) {
          box.hidden = false;
          if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", "true");
            toggleBtn.textContent = "Hide Deals";
          }
        }
      });
    }

    if (toggleBtn && box) {
      toggleBtn.addEventListener("click", () => {
        const isHidden = box.hidden;
        box.hidden = !isHidden;
        toggleBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
        toggleBtn.textContent = isHidden ? "Hide Deals" : "Show Deals";
      });
    }

    updatePreviewTable();
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
  return { init, computeNetDealsByStock, renderFullDealsPage, renderScreenerDealsPreview };
})();

if (typeof window !== "undefined") {
  window.StocksDeals = StocksDeals;
}
