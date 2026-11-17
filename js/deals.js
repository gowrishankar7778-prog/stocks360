/**
 * Stocks 360 - Official NSE Bulk & Block Deals Controller (deals.js)
 * Clean institutional layout for deals.html and screener.html preview,
 * featuring the 5-state Deal Conviction Filter:
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

  // Computes stock-level and client-level net accumulation / distribution
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
        c.sellQty += qty;
        c.sellAmt += amt;
      } else {
        g.buyQty += qty;
        g.buyAmt += amt;
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

  function renderDealsTableHeaders(mode) {
    const isNetMode = mode === "NET_BUYING" || mode === "NET_SELLING";
    const thStyle = "padding:12px 14px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:#475569;";
    if (isNetMode) {
      const netColTitle = mode === "NET_BUYING" ? "Net Buying" : "Net Selling";
      return `
        <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
          <th style="${thStyle}">Date</th>
          <th style="${thStyle}">Stock</th>
          <th style="${thStyle}">Lead Institution</th>
          <th style="${thStyle} text-align:right;">Buy Value</th>
          <th style="${thStyle} text-align:right;">Sell Value</th>
          <th style="${thStyle} text-align:right;">Avg Price (₹)</th>
          <th style="${thStyle} text-align:right;">${netColTitle}</th>
        </tr>
      `;
    }
    return `
      <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
        <th style="${thStyle}">Date</th>
        <th style="${thStyle}">Stock</th>
        <th style="${thStyle}">Client / Institution</th>
        <th style="${thStyle}">Type</th>
        <th style="${thStyle}">Side</th>
        <th style="${thStyle} text-align:right;">Quantity</th>
        <th style="${thStyle} text-align:right;">Avg Price &amp; Value</th>
      </tr>
    `;
  }

  function buildDealRowHtml(d, idx) {
    const isBuy = d.side === "BUY";
    const sideBg = isBuy ? "#dcfce7" : "#fee2e2";
    const sideColor = isBuy ? "#15803d" : "#b91c1c";
    const typeBg = d.dealType === "BLOCK" ? "#eff6ff" : "#f1f5f9";
    const typeColor = d.dealType === "BLOCK" ? "#1d4ed8" : "#475569";

    return `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 14px; color:#64748b; white-space:nowrap; font-size:0.83rem;">${escapeHtml(d.date)}</td>
        <td style="padding:12px 14px;">
          <a href="index.html?symbol=${encodeURIComponent(d.symbol)}" style="color:#1d4ed8; font-weight:700; text-decoration:none; font-size:0.92rem;">
            ${escapeHtml(d.symbol)}
          </a>
          <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${escapeHtml(d.companyName)}</div>
        </td>
        <td style="padding:12px 14px; color:#1e293b; font-size:0.86rem; max-width:290px;">${escapeHtml(d.clientName)}</td>
        <td style="padding:12px 14px; white-space:nowrap;">
          <span style="display:inline-block; font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:999px; background:${typeBg}; color:${typeColor};">
            ${escapeHtml(d.dealType || "BULK")}
          </span>
        </td>
        <td style="padding:12px 14px; white-space:nowrap;">
          <span style="display:inline-block; font-size:0.74rem; font-weight:700; padding:3px 10px; border-radius:999px; background:${sideBg}; color:${sideColor};">
            ${escapeHtml(d.side)}
          </span>
        </td>
        <td style="padding:12px 14px; text-align:right; color:#0f172a; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums;">${formatNumber(d.quantity, 0)}</td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;">
          <div style="font-weight:700; color:#0f172a;">₹ ${formatNumber(d.valueCr, 2)} Cr</div>
          <div style="font-size:0.78rem; color:#64748b;">@ ₹ ${formatNumber(d.price, 2)}</div>
        </td>
      </tr>
    `;
  }

  function buildNetRowHtml(r, idx, mode) {
    const isNetBuy = mode === "NET_BUYING";
    const netColor = isNetBuy ? "#15803d" : "#b91c1c";
    const netBg = isNetBuy ? "#dcfce7" : "#fee2e2";
    const leadClient = isNetBuy ? r.topNetBuyer : r.topNetSeller;
    const leadName = leadClient ? escapeHtml(leadClient.clientName) : "--";
    const leadMeta = leadClient
      ? `${leadClient.netValueCr >= 0 ? "+" : "-"}₹ ${formatNumber(Math.abs(leadClient.netValueCr), 2)} Cr net`
      : `${r.pureBuyersCount} buyers • ${r.pureSellersCount} sellers`;
    const wghtPrice = isNetBuy ? r.avgBuyPrice : r.avgSellPrice;

    return `
      <tr style="background:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 14px; color:#64748b; white-space:nowrap; font-size:0.83rem;">${escapeHtml(r.date)}</td>
        <td style="padding:12px 14px;">
          <a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="color:#1d4ed8; font-weight:700; text-decoration:none; font-size:0.92rem;">
            ${escapeHtml(r.symbol)}
          </a>
          <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${escapeHtml(r.companyName)}</div>
        </td>
        <td style="padding:12px 14px; max-width:280px;">
          <div style="font-size:0.85rem; color:#1e293b; font-weight:600;">${leadName}</div>
          <div style="font-size:0.76rem; color:#64748b; margin-top:2px;">${leadMeta}</div>
        </td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;">
          <div style="color:#15803d; font-weight:600;">₹ ${formatNumber(r.buyValueCr, 2)} Cr</div>
          <div style="font-size:0.75rem; color:#64748b;">${formatNumber(r.buyQty, 0)} sh</div>
        </td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;">
          <div style="color:#b91c1c; font-weight:600;">₹ ${formatNumber(r.sellValueCr, 2)} Cr</div>
          <div style="font-size:0.75rem; color:#64748b;">${formatNumber(r.sellQty, 0)} sh</div>
        </td>
        <td style="padding:12px 14px; text-align:right; color:#334155; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums;">
          ₹ ${formatNumber(wghtPrice, 2)}
        </td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;">
          <span style="display:inline-block; padding:4px 10px; border-radius:8px; background:${netBg}; color:${netColor}; font-weight:800; font-size:0.88rem;">
            ${r.netValueCr >= 0 ? "+" : "-"}₹ ${formatNumber(Math.abs(r.netValueCr), 2)} Cr
          </span>
          <div style="font-size:0.75rem; color:${netColor}; font-weight:600; margin-top:3px;">
            ${r.netQty >= 0 ? "+" : "-"}${formatNumber(Math.abs(r.netQty), 0)} sh
          </div>
        </td>
      </tr>
    `;
  }

  function renderFullDealsPage(root, payload) {
    if (!payload || !Array.isArray(payload.deals)) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">Official NSE Bulk &amp; Block Deals data is temporarily unavailable.</div>`;
      return;
    }

    const summary = payload.summary || {};
    let filterType = "ALL";
    let convictionMode = "ALL";
    let searchQuery = "";

    root.innerHTML = `
      <!-- CLEAN 4-CARD KPI STRIP -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px 18px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
          <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; font-weight:700; margin-bottom:6px;">Latest Session</div>
          <div style="font-size:1.2rem; font-weight:800; color:#0f172a;">${escapeHtml(payload.latestTradeDate || "--")}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">${formatNumber(summary.latestDateDeals || 0)} Official Deals</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid #16a34a; border-radius:12px; padding:16px 18px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
          <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; color:#15803d; font-weight:700; margin-bottom:6px;">Total Buying</div>
          <div style="font-size:1.2rem; font-weight:800; color:#16a34a;">₹ ${formatNumber(summary.buyValueCr || 0, 2)} Cr</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">${formatNumber(summary.buyDealsCount || 0)} Buy Transactions</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid #dc2626; border-radius:12px; padding:16px 18px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
          <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; color:#b91c1c; font-weight:700; margin-bottom:6px;">Total Selling</div>
          <div style="font-size:1.2rem; font-weight:800; color:#dc2626;">₹ ${formatNumber(summary.sellValueCr || 0, 2)} Cr</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">${formatNumber(summary.sellDealsCount || 0)} Sell Transactions</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:12px; padding:16px 18px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
          <div style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; color:#1d4ed8; font-weight:700; margin-bottom:6px;">Net Conviction</div>
          <div style="font-size:1.05rem; font-weight:800; color:#0f172a;">
            <span style="color:#16a34a;">${formatNumber(summary.netBuyingStocksCount || 0)} Net Buy</span>
            &bull;
            <span style="color:#dc2626;">${formatNumber(summary.netSellingStocksCount || 0)} Net Sell</span>
          </div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">HFT Round-Trips Netted Out</div>
        </div>
      </div>

      <!-- CLEAN UNIFIED TOOLBAR & TABLE CARD -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
        <div style="padding:14px 18px; border-bottom:1px solid #e2e8f0; background:#f8fafc; display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between;">
          <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; flex:1;">
            <select id="deals-conviction-select" aria-label="Select Deal View" style="min-width:170px; padding:9px 12px; border:1px solid #2563eb; border-radius:8px; font-weight:700; background:#ffffff; color:#1e3a8a; font-size:0.9rem; cursor:pointer;">
              <option value="ALL" selected>All Deals</option>
              <option value="ONLY_BUYING">Only Buying</option>
              <option value="ONLY_SELLING">Only Selling</option>
              <option value="NET_BUYING">Net Buying</option>
              <option value="NET_SELLING">Net Selling</option>
            </select>

            <select id="deals-type-select" aria-label="Filter by Deal Type" style="padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; background:#ffffff; color:#334155; font-size:0.88rem; cursor:pointer;">
              <option value="ALL">Bulk &amp; Block</option>
              <option value="BULK">Bulk Only</option>
              <option value="BLOCK">Block Only</option>
            </select>

            <input type="search" id="deals-filter-input" class="form-input" placeholder="Search stock symbol or institution..." aria-label="Search stock or institution" style="flex:1; min-width:210px; padding:9px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; font-size:0.9rem;">
          </div>

          <div style="display:flex; align-items:center; gap:12px;">
            <span id="deals-match-meta" style="font-size:0.82rem; color:#64748b; font-weight:600; white-space:nowrap;"></span>
            <button type="button" id="btn-read-deals-aloud" class="btn-secondary" style="padding:8px 14px; font-size:0.86rem;">Listen</button>
          </div>
        </div>

        <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="NSE Bulk and Block Deals Table" style="overflow-x:auto;">
          <table id="deals-data-table" class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.9rem; min-width:780px;">
            <thead id="deals-table-head"></thead>
            <tbody id="deals-table-body"></tbody>
          </table>
        </div>
      </div>
    `;

    function updateTable() {
      const q = searchQuery.trim().toLowerCase();
      const typeFiltered = payload.deals.filter((d) => filterType === "ALL" || d.dealType === filterType);
      const isNetMode = convictionMode === "NET_BUYING" || convictionMode === "NET_SELLING";

      const thead = document.getElementById("deals-table-head");
      const tbody = document.getElementById("deals-table-body");
      const meta = document.getElementById("deals-match-meta");

      if (thead) thead.innerHTML = renderDealsTableHeaders(convictionMode);

      if (isNetMode) {
        const netRows = computeNetDealsByStock(typeFiltered, convictionMode).filter((r) => {
          if (!q) return true;
          const buyerName = r.topNetBuyer ? r.topNetBuyer.clientName : "";
          const sellerName = r.topNetSeller ? r.topNetSeller.clientName : "";
          return `${r.symbol} ${r.companyName} ${buyerName} ${sellerName}`.toLowerCase().includes(q);
        });
        const totalNetCr = netRows.reduce((acc, r) => acc + Math.abs(r.netValueCr), 0);
        if (meta) {
          meta.textContent = `${netRows.length} Stocks • ₹ ${formatNumber(totalNetCr, 2)} Cr Net`;
        }
        if (tbody) {
          if (netRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding:32px; text-align:center; color:#64748b;">No stocks match the selected filter.</td></tr>`;
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
        meta.textContent = `${Math.min(filtered.length, 300)} of ${filtered.length} Deals`;
      }
      if (!tbody) return;
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:32px; text-align:center; color:#64748b;">No deals match your search.</td></tr>`;
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
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
        <div style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-size:0.74rem; font-weight:700; padding:3px 9px; border-radius:999px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
              ${escapeHtml(payload.latestTradeDate || "NSE")}
            </span>
            <strong style="font-size:1.05rem; color:#0f172a;">Bulk &amp; Block Deals</strong>
            <span style="font-size:0.84rem; color:#64748b;">
              ${formatNumber(summary.netBuyingStocksCount || 0)} Net Buy &bull; ${formatNumber(summary.netSellingStocksCount || 0)} Net Sell
            </span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="screener-deals-conviction-select" aria-label="Deals Conviction View" style="padding:7px 12px; border:1px solid #2563eb; border-radius:8px; font-weight:700; background:#ffffff; color:#1e3a8a; font-size:0.85rem; cursor:pointer;">
              <option value="ALL" selected>All Deals</option>
              <option value="ONLY_BUYING">Only Buying</option>
              <option value="ONLY_SELLING">Only Selling</option>
              <option value="NET_BUYING">Net Buying</option>
              <option value="NET_SELLING">Net Selling</option>
            </select>
            <button type="button" id="btn-toggle-screener-deals" class="btn-secondary" aria-expanded="false" aria-controls="screener-deals-collapse" style="font-size:0.85rem; padding:7px 14px;">
              Show Deals
            </button>
            <a href="deals.html" class="btn-primary" style="font-size:0.85rem; padding:7px 14px; text-decoration:none;">
              Full View &rarr;
            </a>
          </div>
        </div>

        <div id="screener-deals-collapse" hidden style="border-top:1px solid #e2e8f0; overflow-x:auto;">
          <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:740px;">
            <thead id="screener-deals-head"></thead>
            <tbody id="screener-deals-body"></tbody>
          </table>
        </div>
      </div>
    `;

    function updatePreviewTable() {
      const isNet = previewMode === "NET_BUYING" || previewMode === "NET_SELLING";
      const thead = document.getElementById("screener-deals-head");
      const tbody = document.getElementById("screener-deals-body");
      if (thead) thead.innerHTML = renderDealsTableHeaders(previewMode);
      if (!tbody) return;
      if (isNet) {
        const netRows = computeNetDealsByStock(payload.deals, previewMode).slice(0, 8);
        tbody.innerHTML = netRows.length
          ? netRows.map((r, i) => buildNetRowHtml(r, i, previewMode)).join("")
          : `<tr><td colspan="7" style="padding:18px; text-align:center; color:#64748b;">No stocks found.</td></tr>`;
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
