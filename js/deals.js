/**
 * Stocks 360 - Official NSE Bulk & Block Deals Controller (deals.js)
 * Single Combo Box Filter: All | Net Buying | Net Selling | Only Buying | Only Selling
 * Dynamically updates table column headings and calculated rows for each option.
 */

const StocksDeals = (function () {
  const DEALS_URL = "data/market/bulk-block-deals.json?v=82";

  const DEAL_VIEW_OPTIONS = [
    { value: "ALL", label: "All" },
    { value: "NET_BUYING", label: "Net Buying" },
    { value: "NET_SELLING", label: "Net Selling" },
    { value: "ONLY_BUYING", label: "Only Buying" },
    { value: "ONLY_SELLING", label: "Only Selling" }
  ];

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

  function computeNetDealsByStock(deals, mode) {
    const byStock = new Map();
    for (const d of deals || []) {
      const k = `${d.date}|${d.symbol}`;
      if (!byStock.has(k)) {
        byStock.set(k, {
          date: d.date,
          symbol: d.symbol,
          companyName: d.companyName,
          buyQty: 0,
          sellQty: 0,
          buyAmt: 0,
          sellAmt: 0
        });
      }
      const g = byStock.get(k);
      const qty = Number(d.quantity) || 0;
      const price = Number(d.price) || 0;
      const amt = qty * price;
      if (d.side === "SELL") {
        g.sellQty += qty;
        g.sellAmt += amt;
      } else {
        g.buyQty += qty;
        g.buyAmt += amt;
      }
    }

    const rows = Array.from(byStock.values()).map((g) => {
      const netQty = g.buyQty - g.sellQty;
      const buyValueCr = Number((g.buyAmt / 10000000).toFixed(2));
      const sellValueCr = Number((g.sellAmt / 10000000).toFixed(2));
      const netValueCr = Number((buyValueCr - sellValueCr).toFixed(2));
      return {
        date: g.date,
        symbol: g.symbol,
        companyName: g.companyName,
        buyQty: g.buyQty,
        sellQty: g.sellQty,
        buyValueCr,
        sellValueCr,
        avgBuyPrice: g.buyQty > 0 ? Number((g.buyAmt / g.buyQty).toFixed(2)) : 0,
        avgSellPrice: g.sellQty > 0 ? Number((g.sellAmt / g.sellQty).toFixed(2)) : 0,
        netQty,
        netValueCr
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
    const thL = "padding:12px 14px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:#475569; text-align:left; white-space:nowrap;";
    const thR = "padding:12px 14px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:700; color:#475569; text-align:right; white-space:nowrap;";

    if (mode === "NET_BUYING") {
      return `
        <tr style="background:#f8fafc; border-bottom:1px solid #cbd5e1;">
          <th style="${thL}">Date</th>
          <th style="${thL}">Symbol</th>
          <th style="${thL}">Company Name</th>
          <th style="${thR}">Total Buy Qty</th>
          <th style="${thR}">Total Sell Qty</th>
          <th style="${thR}">Net Buy Qty</th>
          <th style="${thR}">Avg Buy Price (₹)</th>
          <th style="${thR}">Buy Value (₹ Cr)</th>
          <th style="${thR}">Sell Value (₹ Cr)</th>
          <th style="${thR}">Net Buying Value (₹ Cr)</th>
        </tr>
      `;
    }
    if (mode === "NET_SELLING") {
      return `
        <tr style="background:#f8fafc; border-bottom:1px solid #cbd5e1;">
          <th style="${thL}">Date</th>
          <th style="${thL}">Symbol</th>
          <th style="${thL}">Company Name</th>
          <th style="${thR}">Total Sell Qty</th>
          <th style="${thR}">Total Buy Qty</th>
          <th style="${thR}">Net Sell Qty</th>
          <th style="${thR}">Avg Sell Price (₹)</th>
          <th style="${thR}">Sell Value (₹ Cr)</th>
          <th style="${thR}">Buy Value (₹ Cr)</th>
          <th style="${thR}">Net Selling Value (₹ Cr)</th>
        </tr>
      `;
    }
    if (mode === "ONLY_BUYING") {
      return `
        <tr style="background:#f8fafc; border-bottom:1px solid #cbd5e1;">
          <th style="${thL}">Date</th>
          <th style="${thL}">Symbol</th>
          <th style="${thL}">Company Name</th>
          <th style="${thL}">Buyer Name</th>
          <th style="${thL}">Deal Type</th>
          <th style="${thR}">Quantity Bought</th>
          <th style="${thR}">Buy Price (₹)</th>
          <th style="${thR}">Buy Value (₹ Cr)</th>
        </tr>
      `;
    }
    if (mode === "ONLY_SELLING") {
      return `
        <tr style="background:#f8fafc; border-bottom:1px solid #cbd5e1;">
          <th style="${thL}">Date</th>
          <th style="${thL}">Symbol</th>
          <th style="${thL}">Company Name</th>
          <th style="${thL}">Seller Name</th>
          <th style="${thL}">Deal Type</th>
          <th style="${thR}">Quantity Sold</th>
          <th style="${thR}">Sell Price (₹)</th>
          <th style="${thR}">Sell Value (₹ Cr)</th>
        </tr>
      `;
    }
    return `
      <tr style="background:#f8fafc; border-bottom:1px solid #cbd5e1;">
        <th style="${thL}">Date</th>
        <th style="${thL}">Symbol</th>
        <th style="${thL}">Company Name</th>
        <th style="${thL}">Client Name</th>
        <th style="${thL}">Deal Type</th>
        <th style="${thL}">Buy / Sell</th>
        <th style="${thR}">Quantity Traded</th>
        <th style="${thR}">Trade Price (₹)</th>
        <th style="${thR}">Deal Value (₹ Cr)</th>
      </tr>
    `;
  }

  function filterPureSideDeals(deals, targetSide) {
    const sideFlags = new Map();
    for (const d of deals || []) {
      const k = `${d.date}|${d.symbol}`;
      if (!sideFlags.has(k)) sideFlags.set(k, { buy: false, sell: false });
      const flags = sideFlags.get(k);
      if (d.side === "SELL") flags.sell = true;
      else if (d.side === "BUY") flags.buy = true;
    }
    return (deals || []).filter((d) => {
      const flags = sideFlags.get(`${d.date}|${d.symbol}`);
      if (!flags) return false;
      return targetSide === "BUY" ? (flags.buy && !flags.sell) : (flags.sell && !flags.buy);
    });
  }

  function buildDealsRowsHtml(deals, mode, maxRows = 500) {
    const td = "padding:11px 14px; font-size:0.88rem; color:#1e293b;";
    const tdNum = "padding:11px 14px; font-size:0.88rem; color:#0f172a; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums;";

    if (mode === "NET_BUYING" || mode === "NET_SELLING") {
      const netRows = computeNetDealsByStock(deals, mode).slice(0, maxRows);
      if (netRows.length === 0) {
        return `<tr><td colspan="10" style="padding:28px; text-align:center; color:#64748b;">No deals available for this filter.</td></tr>`;
      }
      const isBuy = mode === "NET_BUYING";
      const netColor = isBuy ? "#15803d" : "#b91c1c";
      const netBg = isBuy ? "#f0fdf4" : "#fef2f2";

      return netRows.map((r, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const firstQty = isBuy ? r.buyQty : r.sellQty;
        const secondQty = isBuy ? r.sellQty : r.buyQty;
        const avgPrice = isBuy ? r.avgBuyPrice : r.avgSellPrice;
        const firstVal = isBuy ? r.buyValueCr : r.sellValueCr;
        const secondVal = isBuy ? r.sellValueCr : r.buyValueCr;
        const signedQty = `${r.netQty >= 0 ? "+" : "-"}${formatNumber(Math.abs(r.netQty), 0)}`;
        const signedVal = `${r.netValueCr >= 0 ? "+" : "-"}₹ ${formatNumber(Math.abs(r.netValueCr), 2)} Cr`;

        return `
          <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
            <td style="${td} color:#64748b; white-space:nowrap;">${escapeHtml(r.date)}</td>
            <td style="${td} white-space:nowrap;">
              <a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="color:#1d4ed8; font-weight:700; text-decoration:none;">${escapeHtml(r.symbol)}</a>
            </td>
            <td style="${td}">${escapeHtml(r.companyName)}</td>
            <td style="${tdNum} font-weight:600;">${formatNumber(firstQty, 0)}</td>
            <td style="${tdNum}">${formatNumber(secondQty, 0)}</td>
            <td style="${tdNum} font-weight:700; color:${netColor};">${signedQty}</td>
            <td style="${tdNum}">₹ ${formatNumber(avgPrice, 2)}</td>
            <td style="${tdNum}">₹ ${formatNumber(firstVal, 2)}</td>
            <td style="${tdNum}">₹ ${formatNumber(secondVal, 2)}</td>
            <td style="${tdNum} font-weight:800; color:${netColor}; background:${netBg};">${signedVal}</td>
          </tr>
        `;
      }).join("");
    }

    if (mode === "ONLY_BUYING" || mode === "ONLY_SELLING") {
      const targetSide = mode === "ONLY_BUYING" ? "BUY" : "SELL";
      const rows = filterPureSideDeals(deals, targetSide).slice(0, maxRows);
      if (rows.length === 0) {
        return `<tr><td colspan="8" style="padding:28px; text-align:center; color:#64748b;">No deals available for this filter.</td></tr>`;
      }
      const valColor = mode === "ONLY_BUYING" ? "#15803d" : "#b91c1c";
      return rows.map((d, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        return `
          <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
            <td style="${td} color:#64748b; white-space:nowrap;">${escapeHtml(d.date)}</td>
            <td style="${td} white-space:nowrap;">
              <a href="index.html?symbol=${encodeURIComponent(d.symbol)}" style="color:#1d4ed8; font-weight:700; text-decoration:none;">${escapeHtml(d.symbol)}</a>
            </td>
            <td style="${td}">${escapeHtml(d.companyName)}</td>
            <td style="${td}">${escapeHtml(d.clientName)}</td>
            <td style="${td} white-space:nowrap;">${escapeHtml(d.dealType || "BULK")}</td>
            <td style="${tdNum} font-weight:600;">${formatNumber(d.quantity, 0)}</td>
            <td style="${tdNum}">₹ ${formatNumber(d.price, 2)}</td>
            <td style="${tdNum} font-weight:700; color:${valColor};">₹ ${formatNumber(d.valueCr, 2)}</td>
          </tr>
        `;
      }).join("");
    }

    // Default: ALL
    const allRows = (deals || []).slice(0, maxRows);
    if (allRows.length === 0) {
      return `<tr><td colspan="9" style="padding:28px; text-align:center; color:#64748b;">No deals available.</td></tr>`;
    }
    return allRows.map((d, idx) => {
      const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      const isBuy = d.side === "BUY";
      const sideBg = isBuy ? "#dcfce7" : "#fee2e2";
      const sideColor = isBuy ? "#15803d" : "#b91c1c";
      return `
        <tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
          <td style="${td} color:#64748b; white-space:nowrap;">${escapeHtml(d.date)}</td>
          <td style="${td} white-space:nowrap;">
            <a href="index.html?symbol=${encodeURIComponent(d.symbol)}" style="color:#1d4ed8; font-weight:700; text-decoration:none;">${escapeHtml(d.symbol)}</a>
          </td>
          <td style="${td}">${escapeHtml(d.companyName)}</td>
          <td style="${td}">${escapeHtml(d.clientName)}</td>
          <td style="${td} white-space:nowrap;">${escapeHtml(d.dealType || "BULK")}</td>
          <td style="${td} white-space:nowrap;">
            <span style="display:inline-block; font-size:0.75rem; font-weight:700; padding:3px 9px; border-radius:999px; background:${sideBg}; color:${sideColor};">${escapeHtml(d.side)}</span>
          </td>
          <td style="${tdNum} font-weight:600;">${formatNumber(d.quantity, 0)}</td>
          <td style="${tdNum}">₹ ${formatNumber(d.price, 2)}</td>
          <td style="${tdNum} font-weight:700;">₹ ${formatNumber(d.valueCr, 2)}</td>
        </tr>
      `;
    }).join("");
  }

  function getOptionLabel(mode) {
    const found = DEAL_VIEW_OPTIONS.find((opt) => opt.value === mode);
    return found ? found.label : "All";
  }

  function buildCollapsibleComboHtml(prefix, currentMode) {
    const activeLabel = getOptionLabel(currentMode);
    const labelId = `${prefix}-combo-label`;
    const btnId = `${prefix}-combo-btn`;
    const listId = `${prefix}-combo-listbox`;

    return `
      <div class="deals-combo-wrapper" id="${prefix}-combo-wrapper" style="position:relative; display:inline-block;">
        <button
          type="button"
          id="${btnId}"
          class="deals-combo-btn"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="${listId}"
          aria-labelledby="${labelId} ${btnId}"
          style="min-width:190px; padding:9px 14px; border:1px solid #2563eb; border-radius:8px; font-weight:700; background:#ffffff; color:#1e3a8a; font-size:0.94rem; cursor:pointer; display:inline-flex; align-items:center; justify-content:space-between; gap:12px;"
        >
          <span id="${prefix}-combo-value-text">${escapeHtml(activeLabel)}</span>
          <span aria-hidden="true" style="font-size:0.75rem; line-height:1;">&#9662;</span>
        </button>
        <div
          id="${listId}"
          role="listbox"
          aria-labelledby="${labelId}"
          hidden
          style="position:absolute; top:calc(100% + 4px); left:0; min-width:100%; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 24px rgba(15,23,42,0.14); z-index:200; padding:4px;"
        >
          ${DEAL_VIEW_OPTIONS.map((opt) => {
            const selected = opt.value === currentMode;
            return `
              <button
                type="button"
                role="option"
                id="${prefix}-option-${opt.value}"
                class="deals-combo-option"
                data-value="${opt.value}"
                aria-selected="${selected ? "true" : "false"}"
                style="display:block; width:100%; text-align:left; padding:9px 12px; border:none; border-radius:6px; font-size:0.9rem; font-weight:${selected ? "700" : "600"}; background:${selected ? "#eff6ff" : "#ffffff"}; color:${selected ? "#1d4ed8" : "#1e293b"}; cursor:pointer;"
              >
                ${escapeHtml(opt.label)}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function bindCollapsibleCombo(prefix, initialMode, onSelectCallback) {
    let selectedMode = initialMode || "ALL";
    const btn = document.getElementById(`${prefix}-combo-btn`);
    const listbox = document.getElementById(`${prefix}-combo-listbox`);
    const valueTextEl = document.getElementById(`${prefix}-combo-value-text`);
    const wrapper = document.getElementById(`${prefix}-combo-wrapper`);
    if (!btn || !listbox) return null;

    // Guarantee initial collapsed state on mount
    listbox.hidden = true;
    btn.setAttribute("aria-expanded", "false");

    function getOptionEls() {
      const fromDom = typeof listbox.querySelectorAll === "function"
        ? Array.from(listbox.querySelectorAll(".deals-combo-option"))
        : [];
      if (fromDom.length > 0) return fromDom;
      return DEAL_VIEW_OPTIONS
        .map((opt) => document.getElementById(`${prefix}-option-${opt.value}`))
        .filter(Boolean);
    }

    function hasHiddenAttr(el) {
      return Boolean(el.hidden || (typeof el.hasAttribute === "function" && el.hasAttribute("hidden")));
    }

    function openCombo(focusIndex) {
      listbox.hidden = false;
      if (typeof listbox.removeAttribute === "function") listbox.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      const opts = getOptionEls();
      const targetIdx = typeof focusIndex === "number"
        ? focusIndex
        : Math.max(0, DEAL_VIEW_OPTIONS.findIndex((o) => o.value === selectedMode));
      const targetOpt = opts[targetIdx] || opts[0];
      if (targetOpt && typeof targetOpt.focus === "function") {
        targetOpt.focus();
      }
    }

    function collapseCombo(restoreFocus) {
      listbox.hidden = true;
      if (typeof listbox.setAttribute === "function") listbox.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      if (restoreFocus && typeof btn.focus === "function") {
        btn.focus();
      }
    }

    function syncOptionStyles() {
      getOptionEls().forEach((optEl, idx) => {
        const val = optEl.getAttribute("data-value") || (DEAL_VIEW_OPTIONS[idx] && DEAL_VIEW_OPTIONS[idx].value);
        const isSel = val === selectedMode;
        optEl.setAttribute("aria-selected", isSel ? "true" : "false");
        if (optEl.style) {
          optEl.style.fontWeight = isSel ? "700" : "600";
          optEl.style.background = isSel ? "#eff6ff" : "#ffffff";
          optEl.style.color = isSel ? "#1d4ed8" : "#1e293b";
        }
      });
    }

    function selectOption(mode, restoreFocus = true) {
      const matched = DEAL_VIEW_OPTIONS.find((o) => o.value === mode);
      if (!matched) return;
      selectedMode = matched.value;
      if (valueTextEl) {
        valueTextEl.textContent = matched.label;
      }
      syncOptionStyles();
      collapseCombo(restoreFocus);
      if (typeof onSelectCallback === "function") {
        onSelectCallback(selectedMode);
      }
    }

    btn.addEventListener("click", function (e) {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (hasHiddenAttr(listbox)) {
        openCombo();
      } else {
        collapseCombo(false);
      }
    });

    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "Down") {
        e.preventDefault();
        openCombo();
      } else if (e.key === "ArrowUp" || e.key === "Up") {
        e.preventDefault();
        openCombo(DEAL_VIEW_OPTIONS.length - 1);
      } else if ((e.key === "Escape" || e.key === "Esc") && !hasHiddenAttr(listbox)) {
        e.preventDefault();
        collapseCombo(true);
      }
    });

    const optionEls = getOptionEls();
    optionEls.forEach((optEl, idx) => {
      const optVal = optEl.getAttribute("data-value") || (DEAL_VIEW_OPTIONS[idx] && DEAL_VIEW_OPTIONS[idx].value);
      optEl.addEventListener("click", function (e) {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        selectOption(optVal, true);
      });
      optEl.addEventListener("mouseenter", function () {
        if (optEl.style && optVal !== selectedMode) {
          optEl.style.background = "#f8fafc";
        }
      });
      optEl.addEventListener("mouseleave", function () {
        if (optEl.style && optVal !== selectedMode) {
          optEl.style.background = "#ffffff";
        }
      });
      optEl.addEventListener("keydown", function (e) {
        const opts = getOptionEls();
        if (e.key === "ArrowDown" || e.key === "Down") {
          e.preventDefault();
          const next = opts[(idx + 1) % opts.length];
          if (next && typeof next.focus === "function") next.focus();
        } else if (e.key === "ArrowUp" || e.key === "Up") {
          e.preventDefault();
          const prev = opts[(idx - 1 + opts.length) % opts.length];
          if (prev && typeof prev.focus === "function") prev.focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          if (opts[0] && typeof opts[0].focus === "function") opts[0].focus();
        } else if (e.key === "End") {
          e.preventDefault();
          const last = opts[opts.length - 1];
          if (last && typeof last.focus === "function") last.focus();
        } else if (e.key === "Escape" || e.key === "Esc") {
          e.preventDefault();
          if (typeof e.stopPropagation === "function") e.stopPropagation();
          collapseCombo(true);
        } else if (e.key === "Tab") {
          collapseCombo(false);
        }
      });
    });

    document.addEventListener("click", function (e) {
      if (!hasHiddenAttr(listbox)) {
        if (!wrapper || (typeof wrapper.contains === "function" && !wrapper.contains(e.target))) {
          collapseCombo(false);
        }
      }
    });

    return { selectOption, openCombo, collapseCombo };
  }

  const MONTHS_ARR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function nseDateToIso(nseDate) {
    const m = String(nseDate || "").trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
    if (!m) return "";
    const moIdx = MONTHS_ARR.indexOf(m[2]);
    if (moIdx < 0) return "";
    const dd = m[1].padStart(2, "0");
    const mm = String(moIdx + 1).padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }

  function isoToNseDate(isoDate) {
    const m = String(isoDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const moIdx = parseInt(m[2], 10) - 1;
    if (moIdx < 0 || moIdx > 11) return "";
    return `${m[3]}-${MONTHS_ARR[moIdx]}-${m[1]}`;
  }

  function renderFullDealsPage(root, payload) {
    if (!payload || !Array.isArray(payload.deals)) {
      root.innerHTML = `<div style="padding:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; color:#64748b;">Official NSE Bulk &amp; Block Deals data is temporarily unavailable.</div>`;
      return;
    }

    const availableIsoDates = Array.from(new Set(payload.deals.map((d) => nseDateToIso(d.date)).filter(Boolean))).sort();
    const minIsoDate = availableIsoDates[0] || "";
    const latestNseDate = payload.latestTradeDate || (payload.deals[0] && payload.deals[0].date) || "";
    const maxIsoDate = nseDateToIso(latestNseDate) || (availableIsoDates[availableIsoDates.length - 1] || "");

    let mode = "ALL";
    let selectedDate = latestNseDate; // Default strictly to latest updated date only

    root.innerHTML = `
      <div style="margin-bottom:16px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span id="deals-conviction-combo-label" style="font-size:0.9rem; font-weight:700; color:#334155; min-width:78px;">Deal View:</span>
            ${buildCollapsibleComboHtml("deals-conviction", mode)}
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <label for="deals-date-picker" style="font-size:0.9rem; font-weight:700; color:#334155; min-width:78px;">Deal Date:</label>
            <input
              type="date"
              id="deals-date-picker"
              value="${escapeHtml(maxIsoDate)}"
              ${minIsoDate ? `min="${escapeHtml(minIsoDate)}"` : ""}
              ${maxIsoDate ? `max="${escapeHtml(maxIsoDate)}"` : ""}
              aria-label="Select historical deal date"
              style="padding:7px 12px; border:1px solid #cbd5e1; border-radius:8px; font-weight:600; color:#0f172a; background:#ffffff; font-size:0.9rem; cursor:pointer;"
            />
            <button type="button" id="btn-deals-latest-date" style="padding:7px 12px; border-radius:8px; border:1px solid #2563eb; background:#eff6ff; color:#1d4ed8; font-size:0.82rem; font-weight:700; cursor:pointer;">
              Latest (${escapeHtml(latestNseDate)})
            </button>
            <button type="button" id="btn-deals-all-dates" style="padding:7px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-size:0.82rem; font-weight:600; cursor:pointer;">
              All Stored Dates
            </button>
          </div>
        </div>
        <span id="deals-match-meta" style="font-size:0.84rem; color:#64748b; font-weight:600;"></span>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
        <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="NSE Bulk and Block Deals Table" style="overflow-x:auto;">
          <table id="deals-data-table" class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem; min-width:860px;">
            <thead id="deals-table-head"></thead>
            <tbody id="deals-table-body"></tbody>
          </table>
        </div>
      </div>
    `;

    const datePickerEl = document.getElementById("deals-date-picker");
    const latestBtnEl = document.getElementById("btn-deals-latest-date");
    const allDatesBtnEl = document.getElementById("btn-deals-all-dates");

    function syncDateButtonStyles() {
      const isAll = selectedDate === "ALL_DATES";
      const isLatest = selectedDate === latestNseDate;
      if (latestBtnEl && latestBtnEl.style) {
        latestBtnEl.style.background = isLatest ? "#eff6ff" : "#ffffff";
        latestBtnEl.style.borderColor = isLatest ? "#2563eb" : "#cbd5e1";
        latestBtnEl.style.color = isLatest ? "#1d4ed8" : "#334155";
      }
      if (allDatesBtnEl && allDatesBtnEl.style) {
        allDatesBtnEl.style.background = isAll ? "#eff6ff" : "#ffffff";
        allDatesBtnEl.style.borderColor = isAll ? "#2563eb" : "#cbd5e1";
        allDatesBtnEl.style.color = isAll ? "#1d4ed8" : "#334155";
      }
    }

    function updateTable() {
      const thead = document.getElementById("deals-table-head");
      const tbody = document.getElementById("deals-table-body");
      const meta = document.getElementById("deals-match-meta");

      const activeDeals = selectedDate === "ALL_DATES"
        ? payload.deals
        : payload.deals.filter((d) => d.date === selectedDate);

      if (thead) thead.innerHTML = renderDealsTableHeaders(mode);
      if (tbody) tbody.innerHTML = buildDealsRowsHtml(activeDeals, mode, 500);
      if (meta) {
        meta.textContent = selectedDate === "ALL_DATES"
          ? `All Historical Dates (${activeDeals.length} deals)`
          : `${selectedDate} (${activeDeals.length} deals)`;
      }
      syncDateButtonStyles();
    }

    if (datePickerEl) {
      datePickerEl.addEventListener("change", function () {
        const pickedNse = isoToNseDate(datePickerEl.value);
        if (pickedNse) {
          selectedDate = pickedNse;
          updateTable();
        }
      });
    }
    if (latestBtnEl) {
      latestBtnEl.addEventListener("click", function () {
        selectedDate = latestNseDate;
        if (datePickerEl) datePickerEl.value = maxIsoDate;
        updateTable();
      });
    }
    if (allDatesBtnEl) {
      allDatesBtnEl.addEventListener("click", function () {
        selectedDate = "ALL_DATES";
        updateTable();
      });
    }

    bindCollapsibleCombo("deals-conviction", mode, function (nextMode) {
      mode = nextMode;
      updateTable();
    });

    updateTable();
  }

  function renderScreenerDealsPreview(root, payload) {
    if (!payload || !Array.isArray(payload.deals) || payload.deals.length === 0) return;

    const latestNseDate = payload.latestTradeDate || (payload.deals[0] && payload.deals[0].date) || "";
    const latestDeals = latestNseDate
      ? payload.deals.filter((d) => d.date === latestNseDate)
      : payload.deals;

    let previewMode = "ALL";

    root.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
        <div style="padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <strong id="screener-deals-conviction-combo-label" style="font-size:1.02rem; color:#0f172a;">Bulk &amp; Block Deals</strong>
            ${buildCollapsibleComboHtml("screener-deals-conviction", previewMode)}
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" id="btn-toggle-screener-deals" class="btn-secondary" aria-expanded="false" aria-controls="screener-deals-collapse" style="font-size:0.84rem; padding:7px 14px;">
              Show Deals
            </button>
            <a href="deals.html" class="btn-primary" style="font-size:0.84rem; padding:7px 14px; text-decoration:none;">
              View Full Table &rarr;
            </a>
          </div>
        </div>

        <div id="screener-deals-collapse" hidden style="border-top:1px solid #e2e8f0; overflow-x:auto;">
          <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:820px;">
            <thead id="screener-deals-head"></thead>
            <tbody id="screener-deals-body"></tbody>
          </table>
        </div>
      </div>
    `;

    function updatePreviewTable() {
      const thead = document.getElementById("screener-deals-head");
      const tbody = document.getElementById("screener-deals-body");
      if (thead) thead.innerHTML = renderDealsTableHeaders(previewMode);
      if (tbody) tbody.innerHTML = buildDealsRowsHtml(latestDeals, previewMode, 10);
    }

    const toggleBtn = document.getElementById("btn-toggle-screener-deals");
    const box = document.getElementById("screener-deals-collapse");

    bindCollapsibleCombo("screener-deals-conviction", previewMode, function (nextMode) {
      previewMode = nextMode;
      updatePreviewTable();
      if (box && box.hidden) {
        box.hidden = false;
        if (typeof box.removeAttribute === "function") box.removeAttribute("hidden");
        if (toggleBtn) {
          toggleBtn.setAttribute("aria-expanded", "true");
          toggleBtn.textContent = "Hide Deals";
        }
      }
    });

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
  return { init, computeNetDealsByStock, filterPureSideDeals, renderDealsTableHeaders, renderFullDealsPage, renderScreenerDealsPreview };
})();

if (typeof window !== "undefined") {
  window.StocksDeals = StocksDeals;
}
