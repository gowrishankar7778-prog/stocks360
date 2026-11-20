/**
 * Stocks 360 - Closing Market Snapshot (Approach A: Single-Active Segment Viewer)
 * - Vertical Exchange selector: NSE (default checked) above BSE
 * - Always-visible FII & DII Data segment in clean tabular format
 * - Clickable Market Segment Links that reveal one focused table at a time
 */
(function () {
  let activeExchange = "NSE";
  let activeSegment = null;
  let lastOpenedSegmentId = null;

  function announceA11y(text) {
    try {
      if (typeof window !== "undefined" && typeof window.speakText === "function" && typeof localStorage !== "undefined" && localStorage.getItem("stocks360_special_a11y") === "true") {
        window.speakText(text, true);
      }
    } catch (_) {}
  }

  const SEGMENTS = [
    { id: "indices", label: "Indices" },
    { id: "sectors", label: "Sectors" },
    { id: "ad-ratio", label: "Advance / Decline Ratio" },
    { id: "top-gainers", label: "Top Gainers" },
    { id: "top-losers", label: "Top Losers" },
    { id: "high-52", label: "52-Week High" },
    { id: "low-52", label: "52-Week Low" },
    { id: "upper-circuit", label: "Upper Circuit" },
    { id: "lower-circuit", label: "Lower Circuit" },
    { id: "pcr-oi", label: "Put-Call Ratio & Open Interest" }
  ];

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

  function getExchangeStocks(exchange) {
    const allStocks = Array.isArray(window.STOCKS_SCREENER_DATASET) ? window.STOCKS_SCREENER_DATASET : [];
    return allStocks.filter((s) => (exchange === "BSE" ? s && (s.exchanges === "BSE" || !!s.bseCode) : s && s.exchanges !== "BSE"));
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

  function renderFiiDiiSegment() {
    const container = document.getElementById("snapshot-fii-dii-section");
    if (!container) return;
    const pulse = window.STOCKS_MARKET_PULSE || null;
    const fiiLatest = pulse && pulse.fiiDiiLatest;

    if (!fiiLatest) {
      container.innerHTML = `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; color:#64748b;">
          FII &amp; DII institutional flow data is not yet loaded.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h2 style="margin:0; font-size:1.12rem; color:#0f172a; font-weight:800;">FII &amp; DII Data</h2>
            <p style="margin:3px 0 0 0; font-size:0.8rem; color:#64748b;">Official NSE Provisional Cash Activity • Session: <strong>${esc(fiiLatest.dateDisplay || fiiLatest.date)}</strong></p>
          </div>
          <span style="font-size:0.82rem; font-weight:800; color:${fiiLatest.combinedNetCr >= 0 ? "#16a34a" : "#dc2626"};">
            Combined Net: ${fmtCr(fiiLatest.combinedNetCr)}
          </span>
        </div>
        <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="FII and DII Cash Market Activity Table" style="overflow-x:auto;">
          <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.9rem; min-width:540px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.78rem; text-transform:uppercase;">
                <th scope="col" style="padding:10px 14px; text-align:left;">Category</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">Buy Value (₹ Cr)</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">Sell Value (₹ Cr)</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">Net Value (₹ Cr)</th>
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
    `;
  }

  function renderSegmentLinks() {
    const linksEl = document.getElementById("snapshot-segment-links");
    if (!linksEl) return;

    linksEl.innerHTML = SEGMENTS.map((seg) => {
      const isSelected = activeSegment === seg.id;
      return `
        <a
          href="#snapshot-segment-panel"
          id="snapshot-link-${seg.id}"
          class="snapshot-segment-link"
          data-segment="${seg.id}"
          aria-controls="snapshot-segment-panel"
          aria-expanded="${isSelected ? "true" : "false"}"
          aria-current="${isSelected ? "true" : "false"}"
          style="display:inline-flex; align-items:center; padding:8px 14px; border-radius:8px; font-size:0.88rem; font-weight:700; text-decoration:none; border:1px solid ${isSelected ? "#2563eb" : "#cbd5e1"}; background:${isSelected ? "#2563eb" : "#ffffff"}; color:${isSelected ? "#ffffff" : "#1e293b"}; transition:all 0.15s;"
        >
          ${esc(seg.label)}
        </a>
      `;
    }).join("");

    linksEl.querySelectorAll(".snapshot-segment-link").forEach((linkEl) => {
      linkEl.addEventListener("click", function (e) {
        e.preventDefault();
        const segId = this.getAttribute("data-segment");
        openSegment(segId, true);
      });
    });
  }

  function buildStockRowsTable(title, subtitle, rows, extraColHeader, extraColFn) {
    const bodyHtml =
      rows.length > 0
        ? rows
            .map((s) => {
              const chg = typeof s.dayChangePct === "number" ? s.dayChangePct : 0;
              const chgColor = chg > 0 ? "#16a34a" : chg < 0 ? "#dc2626" : "#475569";
              const displaySym = activeExchange === "BSE" && s.bseCode ? s.bseCode : s.symbol;
              const linkSym = s.symbol || s.bseCode || "";
              return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:10px 14px;">
                    <a href="index.html?symbol=${encodeURIComponent(linkSym)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(displaySym)}</a>
                    <div style="font-size:0.78rem; color:#64748b;">${esc(s.name)}</div>
                  </td>
                  <td style="padding:10px 14px; text-align:right; font-weight:700; color:#0f172a; white-space:nowrap;">${fmtPrice(s.cmp)}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800; color:${chgColor}; white-space:nowrap;">${fmtPct(s.dayChangePct)}</td>
                  <td style="padding:10px 14px; text-align:right; color:#334155; white-space:nowrap;">${extraColFn(s)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="4" style="padding:18px; text-align:center; color:#64748b;">No qualifying ${esc(activeExchange)} stocks for this segment.</td></tr>`;

    return wrapPanel(
      title,
      subtitle,
      `
        <div class="table-responsive-wrapper" tabindex="0" role="region" aria-label="${esc(title)}" style="overflow-x:auto;">
          <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem; min-width:540px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                <th scope="col" style="padding:10px 14px; text-align:left;">Company</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">CMP</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">Day %</th>
                <th scope="col" style="padding:10px 14px; text-align:right;">${esc(extraColHeader)}</th>
              </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
      `
    );
  }

  function wrapPanel(title, subtitle, bodyHtml) {
    return `
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(15,23,42,0.06);">
        <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 id="snapshot-segment-heading" tabindex="-1" style="margin:0; font-size:1.15rem; color:#0f172a; font-weight:800;">${esc(title)}</h2>
            <p style="margin:3px 0 0 0; font-size:0.8rem; color:#64748b;">${esc(subtitle)}</p>
          </div>
          <button type="button" id="btn-close-snapshot-segment" class="btn-secondary" style="padding:6px 12px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer;">
            Close Table &#10005;
          </button>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  function openSegment(segId, shouldScroll) {
    const panel = document.getElementById("snapshot-segment-panel");
    if (!panel || !segId) return;

    activeSegment = segId;
    renderSegmentLinks();

    const stocks = getExchangeStocks(activeExchange);
    const liquid = stocks.filter((s) => typeof s.cmp === "number" && s.cmp >= 10 && typeof s.volume === "number" && s.volume >= 5000);
    const pool = liquid.length >= 20 ? liquid : stocks;

    let html = "";

    if (segId === "sectors") {
      const sectorMap = new Map();
      for (const s of stocks) {
        const sec = s.sector || "Diversified Equities";
        if (!sectorMap.has(sec)) sectorMap.set(sec, { sector: sec, count: 0, adv: 0, dec: 0, sumPct: 0 });
        const b = sectorMap.get(sec);
        b.count++;
        b.sumPct += typeof s.dayChangePct === "number" ? s.dayChangePct : 0;
        if ((s.dayChange || 0) > 0) b.adv++;
        else if ((s.dayChange || 0) < 0) b.dec++;
      }
      const rows = Array.from(sectorMap.values())
        .filter((b) => b.count >= 3)
        .map((b) => ({ ...b, avgPct: Number((b.sumPct / b.count).toFixed(2)) }))
        .sort((a, b) => b.avgPct - a.avgPct);

      html = wrapPanel(
        `${activeExchange} Sector Performance`,
        "Equal-weighted closing breadth across sectors",
        `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                  <th scope="col" style="padding:10px 14px; text-align:left;">Sector</th>
                  <th scope="col" style="padding:10px 14px; text-align:right;">Stocks</th>
                  <th scope="col" style="padding:10px 14px; text-align:right;">Advances / Declines</th>
                  <th scope="col" style="padding:10px 14px; text-align:right;">Avg Day %</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (sec) => `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 14px; font-weight:700; color:#0f172a;">${esc(sec.sector)}</td>
                    <td style="padding:10px 14px; text-align:right;">${sec.count}</td>
                    <td style="padding:10px 14px; text-align:right;"><span style="color:#16a34a; font-weight:700;">${sec.adv}</span> / <span style="color:#dc2626; font-weight:700;">${sec.dec}</span></td>
                    <td style="padding:10px 14px; text-align:right; font-weight:800; color:${sec.avgPct >= 0 ? "#16a34a" : "#dc2626"};">${fmtPct(sec.avgPct)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
      );
    } else if (segId === "ad-ratio") {
      let adv = 0;
      let dec = 0;
      let unch = 0;
      let above200 = 0;
      let goldenCross = 0;
      for (const s of stocks) {
        const chg = typeof s.dayChange === "number" ? s.dayChange : 0;
        if (chg > 0) adv++;
        else if (chg < 0) dec++;
        else unch++;
        if (typeof s.dma200 === "number" && s.dma200 > 0 && s.cmp > s.dma200) above200++;
        if (s.goldenCross === true) goldenCross++;
      }
      const adRatio = dec > 0 ? (adv / dec).toFixed(2) : String(adv);
      html = wrapPanel(
        `${activeExchange} Advance / Decline Ratio`,
        `Closing breadth across ${stocks.length.toLocaleString("en-IN")} listed equities`,
        `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                  <th scope="col" style="padding:10px 14px; text-align:left;">Metric</th>
                  <th scope="col" style="padding:10px 14px; text-align:right;">Count / Value</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 14px; font-weight:700;">Advances (Closing Higher)</td><td style="padding:10px 14px; text-align:right; font-weight:800; color:#16a34a;">${adv.toLocaleString("en-IN")}</td></tr>
                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 14px; font-weight:700;">Declines (Closing Lower)</td><td style="padding:10px 14px; text-align:right; font-weight:800; color:#dc2626;">${dec.toLocaleString("en-IN")}</td></tr>
                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 14px; font-weight:700;">Unchanged</td><td style="padding:10px 14px; text-align:right; font-weight:700;">${unch.toLocaleString("en-IN")}</td></tr>
                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 14px; font-weight:700;">Advance / Decline Ratio</td><td style="padding:10px 14px; text-align:right; font-weight:800; color:#1d4ed8;">${adRatio}</td></tr>
                <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 14px; font-weight:700;">Trading Above 200-DMA</td><td style="padding:10px 14px; text-align:right; font-weight:700;">${above200.toLocaleString("en-IN")}</td></tr>
                <tr><td style="padding:10px 14px; font-weight:700;">Golden Crossover (50-DMA &gt; 200-DMA)</td><td style="padding:10px 14px; text-align:right; font-weight:700;">${goldenCross.toLocaleString("en-IN")}</td></tr>
              </tbody>
            </table>
          </div>
        `
      );
    } else if (segId === "top-gainers") {
      const rows = pool
        .filter((s) => typeof s.dayChangePct === "number" && s.dayChangePct > 0)
        .sort((a, b) => b.dayChangePct - a.dayChangePct)
        .slice(0, 20);
      html = buildStockRowsTable(`${activeExchange} Top Gainers`, "Top 20 closing percentage gainers", rows, "Volume", (s) => fmtVol(s.volume));
    } else if (segId === "top-losers") {
      const rows = pool
        .filter((s) => typeof s.dayChangePct === "number" && s.dayChangePct < 0)
        .sort((a, b) => a.dayChangePct - b.dayChangePct)
        .slice(0, 20);
      html = buildStockRowsTable(`${activeExchange} Top Losers`, "Top 20 closing percentage decliners", rows, "Volume", (s) => fmtVol(s.volume));
    } else if (segId === "high-52") {
      if (activeExchange === "BSE") {
        html = wrapPanel(
          "BSE 52-Week High Stocks",
          "Official BSE 52-Week High Summary",
          `<div style="padding:18px; color:#475569; font-size:0.9rem;">52-Week High data is currently unavailable for BSE in this view. Switch to NSE to view 52-Week High stocks.</div>`
        );
      } else {
        const rows = stocks
          .filter((s) => hasValid52WeekRange(s) && ((typeof s.dayHigh === "number" && s.dayHigh >= s.high52) || s.cmp >= s.high52 * 0.99))
          .sort((a, b) => (b.volume || 0) - (a.volume || 0))
          .slice(0, 20);
        html = buildStockRowsTable("NSE 52-Week High Stocks", "Closing at or within 1% of 52-week high", rows, "52W High", (s) => fmtPrice(s.high52));
      }
    } else if (segId === "low-52") {
      if (activeExchange === "BSE") {
        html = wrapPanel(
          "BSE 52-Week Low Stocks",
          "Official BSE 52-Week Low Summary",
          `<div style="padding:18px; color:#475569; font-size:0.9rem;">52-Week Low data is currently unavailable for BSE in this view. Switch to NSE to view 52-Week Low stocks.</div>`
        );
      } else {
        const rows = stocks
          .filter((s) => hasValid52WeekRange(s) && ((typeof s.dayLow === "number" && s.dayLow <= s.low52) || s.cmp <= s.low52 * 1.01))
          .sort((a, b) => (b.volume || 0) - (a.volume || 0))
          .slice(0, 20);
        html = buildStockRowsTable("NSE 52-Week Low Stocks", "Closing at or within 1% of 52-week low", rows, "52W Low", (s) => fmtPrice(s.low52));
      }
    } else if (segId === "indices") {
      const pulse = window.STOCKS_MARKET_PULSE || null;
      const indices = activeExchange === "NSE" && pulse && Array.isArray(pulse.nseIndices) ? pulse.nseIndices : [];
      if (activeExchange === "BSE" || indices.length === 0) {
        html = wrapPanel(
          `${activeExchange} Indices`,
          "Official Exchange Indices Feed",
          `<div style="padding:18px; color:#475569; font-size:0.9rem;">${activeExchange === "BSE" ? "BSE Indices feed will be connected next. Switch to NSE to inspect all Nifty broad &amp; sectoral indices." : "Indices data is currently unavailable."}</div>`
        );
      } else {
        html = wrapPanel(
          "NSE Market & Sector Indices",
          `Official NSE Indices (${indices.length} indices)`,
          `
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.76rem; text-transform:uppercase;">
                    <th scope="col" style="padding:10px 14px; text-align:left;">Index</th>
                    <th scope="col" style="padding:10px 14px; text-align:right;">Last</th>
                    <th scope="col" style="padding:10px 14px; text-align:right;">Change %</th>
                    <th scope="col" style="padding:10px 14px; text-align:right;">High / Low</th>
                    <th scope="col" style="padding:10px 14px; text-align:right;">P/E</th>
                  </tr>
                </thead>
                <tbody>
                  ${indices
                    .map((idx) => {
                      const chgColor = idx.percentChange > 0 ? "#16a34a" : idx.percentChange < 0 ? "#dc2626" : "#475569";
                      return `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                          <td style="padding:10px 14px; font-weight:700; color:#0f172a;">${esc(idx.index)}</td>
                          <td style="padding:10px 14px; text-align:right; font-weight:700;">${Number(idx.last).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style="padding:10px 14px; text-align:right; font-weight:800; color:${chgColor};">${fmtPct(idx.percentChange)}</td>
                          <td style="padding:10px 14px; text-align:right; color:#475569; white-space:nowrap;">${idx.high != null ? idx.high.toLocaleString("en-IN") : "--"} / ${idx.low != null ? idx.low.toLocaleString("en-IN") : "--"}</td>
                          <td style="padding:10px 14px; text-align:right; color:#475569;">${idx.pe != null ? idx.pe.toFixed(2) : "--"}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          `
        );
      }
    } else if (segId === "upper-circuit" || segId === "lower-circuit") {
      const pulse = window.STOCKS_MARKET_PULSE || null;
      const isUpper = segId === "upper-circuit";
      const rows = activeExchange === "NSE" && pulse
        ? (isUpper ? pulse.nseUpperCircuit : pulse.nseLowerCircuit) || []
        : [];
      if (activeExchange === "BSE") {
        html = wrapPanel(
          `BSE ${isUpper ? "Upper Circuit" : "Lower Circuit"} Stocks`,
          "Official BSE Price Band Summary",
          `<div style="padding:18px; color:#475569; font-size:0.9rem;">Daily circuit limits are currently unavailable for BSE in this view. Switch to NSE to inspect official NSE ${isUpper ? "Upper" : "Lower"} Circuit stocks.</div>`
        );
      } else {
        html = buildStockRowsTable(
          `NSE ${isUpper ? "Upper Circuit" : "Lower Circuit"} Stocks`,
          `Matched against official NSE daily price bands`,
          rows,
          "Price Band",
          (s) => `${s.bandPct}% • ${fmtVol(s.volume)}`
        );
      }
    } else if (segId === "pcr-oi") {
      const pulse = window.STOCKS_MARKET_PULSE || null;
      const fo = activeExchange === "NSE" && pulse && pulse.nseFoSnapshot ? pulse.nseFoSnapshot : null;
      if (activeExchange === "BSE" || !fo) {
        html = wrapPanel(
          `${activeExchange} Put-Call Ratio & Open Interest`,
          "Official Derivatives Summary",
          `<div style="padding:18px; color:#475569; font-size:0.9rem;">${activeExchange === "BSE" ? "Derivatives summary is currently unavailable for BSE in this view. Switch to NSE to inspect Index PCR and Stock Open Interest." : "NSE Derivatives data is currently unavailable."}</div>`
        );
      } else {
        const idxRows = (fo.indexPcr || []).map((r) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px; font-weight:800; color:#0f172a;">${esc(r.symbol)}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:800; color:#1d4ed8;">${r.pcrOi != null ? r.pcrOi.toFixed(2) : "--"}</td>
            <td style="padding:10px 14px; text-align:right;">${fmtVol(r.ceOi)}</td>
            <td style="padding:10px 14px; text-align:right;">${fmtVol(r.peOi)}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:700;">${fmtVol(r.totalOi)}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:800; color:${r.chgOiPct >= 0 ? "#16a34a" : "#dc2626"};">${fmtPct(r.chgOiPct)}</td>
          </tr>
        `).join("");

        const stockRows = (fo.topStockOi || []).map((r) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px;"><a href="index.html?symbol=${encodeURIComponent(r.symbol)}" style="font-weight:800; color:#1d4ed8; text-decoration:none;">${esc(r.symbol)}</a></td>
            <td style="padding:10px 14px; text-align:right;">${r.underlyingPrice != null ? fmtPrice(r.underlyingPrice) : "--"}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:800; color:#1d4ed8;">${r.pcrOi != null ? r.pcrOi.toFixed(2) : "--"}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:700;">${fmtVol(r.totalOi)}</td>
            <td style="padding:10px 14px; text-align:right; font-weight:800; color:${r.chgOiPct >= 0 ? "#16a34a" : "#dc2626"};">${fmtPct(r.chgOiPct)}</td>
          </tr>
        `).join("");

        html = wrapPanel(
          "NSE Put-Call Ratio (PCR) & Open Interest",
          `Official NSE Derivatives Summary • Session: ${fo.tradeDate}`,
          `
            <div style="padding:14px 16px 6px 16px; font-size:0.86rem; font-weight:800; color:#0f172a;">Index Derivatives PCR &amp; Open Interest</div>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.75rem; text-transform:uppercase;">
                    <th scope="col" style="padding:9px 14px; text-align:left;">Index</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">PCR (OI)</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">Call OI</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">Put OI</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">Total OI</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">OI Chg %</th>
                  </tr>
                </thead>
                <tbody>${idxRows}</tbody>
              </table>
            </div>
            <div style="padding:16px 16px 6px 16px; font-size:0.86rem; font-weight:800; color:#0f172a; border-top:1px solid #e2e8f0;">Top 20 F&amp;O Stocks by Open Interest</div>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-size:0.75rem; text-transform:uppercase;">
                    <th scope="col" style="padding:9px 14px; text-align:left;">Stock</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">Underlying</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">PCR (OI)</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">Total OI</th>
                    <th scope="col" style="padding:9px 14px; text-align:right;">OI Chg %</th>
                  </tr>
                </thead>
                <tbody>${stockRows}</tbody>
              </table>
            </div>
          `
        );
      }
    } else {
      const segMeta = SEGMENTS.find((s) => s.id === segId) || { label: segId };
      html = wrapPanel(`${activeExchange} ${segMeta.label}`, "Official Exchange Feed Integration", `<div style="padding:18px; color:#475569; font-size:0.9rem;">Data unavailable.</div>`);
    }

    function closeActiveSegment(restoreFocus) {
      const targetSeg = lastOpenedSegmentId;
      activeSegment = null;
      panel.hidden = true;
      panel.innerHTML = "";
      renderSegmentLinks();
      if (restoreFocus && targetSeg) {
        const prevLink = document.getElementById("snapshot-link-" + targetSeg);
        if (prevLink && typeof prevLink.focus === "function") prevLink.focus();
      }
      announceA11y("Closed market segment table.");
    }

    lastOpenedSegmentId = segId;
    panel.innerHTML = html;
    panel.hidden = false;
    if (typeof panel.removeAttribute === "function") panel.removeAttribute("hidden");

    const closeBtn = document.getElementById("btn-close-snapshot-segment");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeActiveSegment(true));
    }

    if (shouldScroll) {
      const segMeta = SEGMENTS.find((s) => s.id === segId);
      announceA11y(`Opened ${activeExchange} ${segMeta ? segMeta.label : segId} table.`);
      const heading = document.getElementById("snapshot-segment-heading") || panel;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (typeof heading.focus === "function") heading.focus();
          if (typeof heading.scrollIntoView === "function") heading.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }

  function setExchange(exchange) {
    activeExchange = exchange === "BSE" ? "BSE" : "NSE";
    const stocks = getExchangeStocks(activeExchange);
    let sessionLabel = "Latest Closing Session";
    for (const s of stocks) {
      if (s && s.lastUpdated) {
        sessionLabel = s.lastUpdated;
        break;
      }
    }

    const metaEl = document.getElementById("snapshot-active-meta");
    const hintEl = document.getElementById("snapshot-session-hint");
    if (metaEl) metaEl.textContent = `Showing ${activeExchange}: ${stocks.length.toLocaleString("en-IN")} Listed Equities • ${sessionLabel}`;
    if (hintEl) hintEl.textContent = "Closing Session: " + sessionLabel;

    const nseRadio = document.getElementById("chk-snapshot-nse");
    const bseRadio = document.getElementById("chk-snapshot-bse");
    if (nseRadio) nseRadio.checked = activeExchange === "NSE";
    if (bseRadio) bseRadio.checked = activeExchange === "BSE";

    renderFiiDiiSegment();
    renderSegmentLinks();
    if (activeSegment) {
      openSegment(activeSegment, false);
    }
  }

  function init() {
    const nseRadio = document.getElementById("chk-snapshot-nse");
    const bseRadio = document.getElementById("chk-snapshot-bse");
    if (nseRadio) nseRadio.addEventListener("change", () => { if (nseRadio.checked) { setExchange("NSE"); announceA11y("Switched Market Snapshot to NSE."); } });
    if (bseRadio) bseRadio.addEventListener("change", () => { if (bseRadio.checked) { setExchange("BSE"); announceA11y("Switched Market Snapshot to BSE."); } });

    document.addEventListener("keydown", (e) => {
      if ((e.key === "Escape" || e.key === "Esc") && activeSegment) {
        const panel = document.getElementById("snapshot-segment-panel");
        const prevSeg = lastOpenedSegmentId;
        activeSegment = null;
        if (panel) {
          panel.hidden = true;
          panel.innerHTML = "";
        }
        renderSegmentLinks();
        if (prevSeg) {
          const prevLink = document.getElementById("snapshot-link-" + prevSeg);
          if (prevLink && typeof prevLink.focus === "function") prevLink.focus();
        }
        announceA11y("Closed market segment table.");
      }
    });

    const params = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search || "") : null;
    const initialEx = params && String(params.get("exchange") || "").toUpperCase() === "BSE" ? "BSE" : "NSE";
    setExchange(initialEx);
  }

  if (typeof window !== "undefined") {
    window.StocksMarketSnapshot = { setExchange, openSegment };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
