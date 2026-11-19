/**
 * Stocks 360 - Closing Market Snapshot (NSE & BSE Exchange Switcher)
 * Step 1: Bhavcopy-powered Market Breadth, Sector Performance, FII/DII Flows,
 *         Top Gainers, Top Losers, Most Active by Volume, and 52W High/Low tables.
 */
(function () {
  let activeExchange = "NSE";

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

  function fmtVol(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return "--";
    if (v >= 10000000) return (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return (v / 100000).toFixed(2) + " L";
    return v.toLocaleString("en-IN");
  }

  function fmtCr(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v > 0 ? "+₹ " : v < 0 ? "-₹ " : "₹ ") + abs + " Cr";
  }

  function isNseStock(s) {
    return s && s.exchanges !== "BSE";
  }

  function isBseStock(s) {
    return s && (s.exchanges === "BSE" || !!s.bseCode);
  }

  function hasValid52WeekRange(s) {
    return (
      typeof s.high52 === "number" &&
      typeof s.low52 === "number" &&
      s.high52 > 0 &&
      s.low52 > 0 &&
      s.high52 > s.low52 * 1.02
    );
  }

  function renderStockTable(title, subtitle, rows, extraHeader, extraCellFn) {
    const bodyHtml =
      rows.length > 0
        ? rows
            .map((s) => {
              const chg = typeof s.dayChangePct === "number" ? s.dayChangePct : 0;
              const chgColor = chg > 0 ? "#16a34a" : chg < 0 ? "#dc2626" : "#475569";
              const symCode = activeExchange === "BSE" && s.bseCode ? s.bseCode : s.symbol;
              const linkSym = s.symbol || s.bseCode || "";
              return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px 12px;">
                    <a href="index.html?symbol=${encodeURIComponent(linkSym)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">
                      ${esc(symCode)}
                    </a>
                    <div style="font-size:0.78rem; color:#64748b; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(s.name)}</div>
                  </td>
                  <td style="padding:10px 12px; font-weight:700; color:#0f172a; text-align:right; white-space:nowrap;">${fmtPrice(s.cmp)}</td>
                  <td style="padding:10px 12px; font-weight:800; color:${chgColor}; text-align:right; white-space:nowrap;">${fmtPct(s.dayChangePct)}</td>
                  <td style="padding:10px 12px; color:#334155; text-align:right; white-space:nowrap;">${extraCellFn(s)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="4" style="padding:16px; text-align:center; color:#64748b;">No qualifying stocks for this session.</td></tr>`;

    return `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
          <h2 style="margin:0; font-size:1.08rem; color:#0f172a; font-weight:800;">${esc(title)}</h2>
          <p style="margin:3px 0 0 0; font-size:0.78rem; color:#64748b;">${esc(subtitle)}</p>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                <th scope="col" style="padding:9px 12px; text-align:left;">Company</th>
                <th scope="col" style="padding:9px 12px; text-align:right;">CMP</th>
                <th scope="col" style="padding:9px 12px; text-align:right;">Day %</th>
                <th scope="col" style="padding:9px 12px; text-align:right;">${esc(extraHeader)}</th>
              </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSnapshot(exchange) {
    activeExchange = exchange === "BSE" ? "BSE" : "NSE";
    const root = document.getElementById("market-snapshot-root");
    const nseBtn = document.getElementById("btn-snapshot-nse");
    const bseBtn = document.getElementById("btn-snapshot-bse");
    const metaEl = document.getElementById("snapshot-active-meta");
    const hintEl = document.getElementById("snapshot-session-hint");

    if (nseBtn && bseBtn) {
      const isNse = activeExchange === "NSE";
      nseBtn.setAttribute("aria-pressed", isNse ? "true" : "false");
      bseBtn.setAttribute("aria-pressed", !isNse ? "true" : "false");
      nseBtn.style.background = isNse ? "#0f172a" : "#ffffff";
      nseBtn.style.color = isNse ? "#ffffff" : "#334155";
      nseBtn.style.borderColor = isNse ? "#0f172a" : "#cbd5e1";
      bseBtn.style.background = !isNse ? "#2563eb" : "#ffffff";
      bseBtn.style.color = !isNse ? "#ffffff" : "#334155";
      bseBtn.style.borderColor = !isNse ? "#2563eb" : "#cbd5e1";
    }

    if (!root) return;
    const allStocks = Array.isArray(window.STOCKS_SCREENER_DATASET) ? window.STOCKS_SCREENER_DATASET : [];
    const stocks = allStocks.filter(activeExchange === "NSE" ? isNseStock : isBseStock);
    const pulse = window.STOCKS_MARKET_PULSE || null;

    let sessionLabel = "Latest Closing Session";
    let advances = 0;
    let declines = 0;
    let unchanged = 0;
    let above200 = 0;
    let goldenCross = 0;
    const sectorMap = new Map();

    for (const s of stocks) {
      if (sessionLabel === "Latest Closing Session" && s.lastUpdated) {
        sessionLabel = s.lastUpdated;
      }
      const chg = typeof s.dayChange === "number" ? s.dayChange : 0;
      const chgPct = typeof s.dayChangePct === "number" ? s.dayChangePct : 0;
      if (chg > 0) advances++;
      else if (chg < 0) declines++;
      else unchanged++;

      if (typeof s.dma200 === "number" && s.dma200 > 0 && s.cmp > s.dma200) above200++;
      if (s.goldenCross === true) goldenCross++;

      const sec = s.sector || "Diversified Equities";
      if (!sectorMap.has(sec)) sectorMap.set(sec, { sector: sec, count: 0, adv: 0, dec: 0, sumPct: 0 });
      const b = sectorMap.get(sec);
      b.count++;
      b.sumPct += chgPct;
      if (chg > 0) b.adv++;
      else if (chg < 0) b.dec++;
    }

    if (hintEl) hintEl.textContent = "Closing Session: " + sessionLabel;
    if (metaEl) metaEl.textContent = `${activeExchange}: ${stocks.length.toLocaleString("en-IN")} Listed Equities • ${sessionLabel}`;

    const total = Math.max(1, stocks.length);
    const advPct = ((advances / total) * 100).toFixed(1);
    const decPct = ((declines / total) * 100).toFixed(1);
    const adRatio = declines > 0 ? (advances / declines).toFixed(2) : String(advances);

    const sectors = Array.from(sectorMap.values())
      .filter((b) => b.count >= 3)
      .map((b) => ({ ...b, avgPct: Number((b.sumPct / b.count).toFixed(2)) }))
      .sort((a, b) => b.avgPct - a.avgPct);

    const liquidPool = stocks.filter((s) => typeof s.cmp === "number" && s.cmp >= 10 && typeof s.volume === "number" && s.volume >= 5000);
    const gainersPool = (liquidPool.length >= 15 ? liquidPool : stocks)
      .filter((s) => typeof s.dayChangePct === "number" && s.dayChangePct > 0)
      .sort((a, b) => b.dayChangePct - a.dayChangePct)
      .slice(0, 12);
    const losersPool = (liquidPool.length >= 15 ? liquidPool : stocks)
      .filter((s) => typeof s.dayChangePct === "number" && s.dayChangePct < 0)
      .sort((a, b) => a.dayChangePct - b.dayChangePct)
      .slice(0, 12);
    const activePool = stocks
      .filter((s) => typeof s.volume === "number" && s.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 12);

    const high52Pool = stocks
      .filter((s) => hasValid52WeekRange(s) && ((typeof s.dayHigh === "number" && s.dayHigh >= s.high52) || s.cmp >= s.high52 * 0.99))
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 12);
    const low52Pool = stocks
      .filter((s) => hasValid52WeekRange(s) && ((typeof s.dayLow === "number" && s.dayLow <= s.low52) || s.cmp <= s.low52 * 1.01))
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 12);

    // 1. Breadth Summary Table / Strip
    const breadthHtml = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <h2 style="margin:0; font-size:1.12rem; color:#0f172a; font-weight:800;">${activeExchange} Market Breadth &amp; Advance / Decline Ratio</h2>
          <span style="font-size:0.82rem; font-weight:700; padding:4px 10px; border-radius:999px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
            A/D Ratio: ${adRatio}
          </span>
        </div>
        <div style="display:flex; height:11px; border-radius:999px; overflow:hidden; background:#e2e8f0; margin-bottom:12px;">
          <div style="width:${advPct}%; background:#16a34a;"></div>
          <div style="width:${Math.max(0, 100 - Number(advPct) - Number(decPct)).toFixed(1)}%; background:#94a3b8;"></div>
          <div style="width:${decPct}%; background:#dc2626;"></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(145px, 1fr)); gap:10px;">
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px;">
            <div style="font-size:0.75rem; color:#166534; font-weight:700;">Advances</div>
            <div style="font-size:1.08rem; color:#16a34a; font-weight:800;">${advances.toLocaleString("en-IN")} (${advPct}%)</div>
          </div>
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 12px;">
            <div style="font-size:0.75rem; color:#991b1b; font-weight:700;">Declines</div>
            <div style="font-size:1.08rem; color:#dc2626; font-weight:800;">${declines.toLocaleString("en-IN")} (${decPct}%)</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
            <div style="font-size:0.75rem; color:#475569; font-weight:700;">Unchanged</div>
            <div style="font-size:1.08rem; color:#0f172a; font-weight:800;">${unchanged.toLocaleString("en-IN")}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
            <div style="font-size:0.75rem; color:#475569; font-weight:700;">Above 200-DMA / GC</div>
            <div style="font-size:1.02rem; color:#0f172a; font-weight:800;">${above200.toLocaleString("en-IN")} / ${goldenCross.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>
    `;

    // 2. FII/DII Cash Flows Table
    const fiiLatest = pulse && pulse.fiiDiiLatest;
    const fiiHtml = fiiLatest
      ? `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
          <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <h2 style="margin:0; font-size:1.08rem; color:#0f172a; font-weight:800;">FII &amp; DII Cash Market Activity</h2>
              <p style="margin:3px 0 0 0; font-size:0.78rem; color:#64748b;">Official NSE Provisional Institutional Flows • Session: ${esc(fiiLatest.dateDisplay || fiiLatest.date)}</p>
            </div>
            <span style="font-size:0.8rem; font-weight:700; color:${fiiLatest.combinedNetCr >= 0 ? "#16a34a" : "#dc2626"};">
              Combined Net: ${fmtCr(fiiLatest.combinedNetCr)}
            </span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                  <th scope="col" style="padding:9px 14px; text-align:left;">Category</th>
                  <th scope="col" style="padding:9px 14px; text-align:right;">Buy Value</th>
                  <th scope="col" style="padding:9px 14px; text-align:right;">Sell Value</th>
                  <th scope="col" style="padding:9px 14px; text-align:right;">Net Value</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px 14px; font-weight:700; color:#0f172a;">FII / FPI</td>
                  <td style="padding:10px 14px; text-align:right;">${fmtCr(fiiLatest.fii && fiiLatest.fii.buyCr).replace(/^\+/, "")}</td>
                  <td style="padding:10px 14px; text-align:right;">${fmtCr(fiiLatest.fii && fiiLatest.fii.sellCr).replace(/^\+/, "")}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800; color:${(fiiLatest.fii && fiiLatest.fii.netCr) >= 0 ? "#16a34a" : "#dc2626"};">${fmtCr(fiiLatest.fii && fiiLatest.fii.netCr)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px; font-weight:700; color:#0f172a;">DII (Domestic)</td>
                  <td style="padding:10px 14px; text-align:right;">${fmtCr(fiiLatest.dii && fiiLatest.dii.buyCr).replace(/^\+/, "")}</td>
                  <td style="padding:10px 14px; text-align:right;">${fmtCr(fiiLatest.dii && fiiLatest.dii.sellCr).replace(/^\+/, "")}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800; color:${(fiiLatest.dii && fiiLatest.dii.netCr) >= 0 ? "#16a34a" : "#dc2626"};">${fmtCr(fiiLatest.dii && fiiLatest.dii.netCr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `
      : "";

    // 3. Sector Performance Table
    const sectorsHtml = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
          <h2 style="margin:0; font-size:1.08rem; color:#0f172a; font-weight:800;">${activeExchange} Sector Performance</h2>
          <p style="margin:3px 0 0 0; font-size:0.78rem; color:#64748b;">Equal-weighted closing breadth across sectors (minimum 3 listed stocks)</p>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                <th scope="col" style="padding:9px 14px; text-align:left;">Sector</th>
                <th scope="col" style="padding:9px 14px; text-align:right;">Stocks</th>
                <th scope="col" style="padding:9px 14px; text-align:right;">Adv / Dec</th>
                <th scope="col" style="padding:9px 14px; text-align:right;">Avg Day %</th>
              </tr>
            </thead>
            <tbody>
              ${
                sectors.length > 0
                  ? sectors
                      .map(
                        (sec) => `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:9px 14px; font-weight:700; color:#0f172a;">${esc(sec.sector)}</td>
                    <td style="padding:9px 14px; text-align:right; color:#475569;">${sec.count}</td>
                    <td style="padding:9px 14px; text-align:right; color:#475569;"><span style="color:#16a34a; font-weight:700;">${sec.adv}</span> / <span style="color:#dc2626; font-weight:700;">${sec.dec}</span></td>
                    <td style="padding:9px 14px; text-align:right; font-weight:800; color:${sec.avgPct >= 0 ? "#16a34a" : "#dc2626"};">${fmtPct(sec.avgPct)}</td>
                  </tr>
                `
                      )
                      .join("")
                  : `<tr><td colspan="4" style="padding:16px; text-align:center; color:#64748b;">No sector breakdown available.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 4. Gainers, Losers, Most Active, 52W High/Low
    const gainersHtml = renderStockTable(
      `${activeExchange} Top Gainers`,
      "Closing percentage leaders",
      gainersPool,
      "Volume",
      (s) => fmtVol(s.volume)
    );
    const losersHtml = renderStockTable(
      `${activeExchange} Top Losers`,
      "Closing percentage decliners",
      losersPool,
      "Volume",
      (s) => fmtVol(s.volume)
    );
    const activeHtml = renderStockTable(
      `${activeExchange} Most Active by Volume`,
      "Highest traded share volume",
      activePool,
      activeExchange === "NSE" ? "Deliv %" : "Volume",
      (s) =>
        activeExchange === "NSE" && typeof s.deliveryPct === "number" && s.deliveryPct > 0
          ? s.deliveryPct.toFixed(1) + "% (" + fmtVol(s.volume) + ")"
          : fmtVol(s.volume)
    );
    const high52Html =
      activeExchange === "NSE"
        ? renderStockTable(
            "NSE 52-Week High Stocks",
            "Closing at or within 1% of 52-week high",
            high52Pool,
            "52W High",
            (s) => fmtPrice(s.high52)
          )
        : `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; color:#475569; font-size:0.88rem;">
            <strong style="color:#0f172a; display:block; margin-bottom:4px;">BSE 52-Week High / Low &amp; Circuits</strong>
            BSE multi-month 52-Week High/Low and official Upper/Lower Circuit tables will be connected in Step 2 via BSE's official price band &amp; 52W feeds (zero synthetic approximations).
          </div>
        `;
    const low52Html =
      activeExchange === "NSE"
        ? renderStockTable(
            "NSE 52-Week Low Stocks",
            "Closing at or within 1% of 52-week low",
            low52Pool,
            "52W Low",
            (s) => fmtPrice(s.low52)
          )
        : "";

    root.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        ${breadthHtml}
        ${fiiHtml}
        ${sectorsHtml}
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px;">
          ${gainersHtml}
          ${losersHtml}
        </div>
        ${activeHtml}
        ${
          activeExchange === "NSE"
            ? `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px;">${high52Html}${low52Html}</div>`
            : high52Html
        }
      </div>
    `;
  }

  function init() {
    const nseBtn = document.getElementById("btn-snapshot-nse");
    const bseBtn = document.getElementById("btn-snapshot-bse");

    if (nseBtn) nseBtn.addEventListener("click", () => renderSnapshot("NSE"));
    if (bseBtn) bseBtn.addEventListener("click", () => renderSnapshot("BSE"));

    const params = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search || "") : null;
    const initialEx = params && String(params.get("exchange") || "").toUpperCase() === "BSE" ? "BSE" : "NSE";
    renderSnapshot(initialEx);
  }

  if (typeof window !== "undefined") {
    window.StocksMarketSnapshot = { renderSnapshot };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
