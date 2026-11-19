/**
 * Stocks 360 - Homepage Market Pulse (FII/DII Activity & Market Breadth)
 */
(function () {
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtCr(val) {
    if (typeof val !== "number" || !Number.isFinite(val)) return "N/A";
    const abs = Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (val > 0 ? "+₹" : val < 0 ? "-₹" : "₹") + " " + abs + " Cr";
  }

  function fmtUnsignedCr(val) {
    if (typeof val !== "number" || !Number.isFinite(val)) return "N/A";
    return "₹ " + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Cr";
  }

  function netColor(val) {
    if (typeof val !== "number" || !Number.isFinite(val)) return "#475569";
    return val > 0 ? "#16a34a" : val < 0 ? "#dc2626" : "#475569";
  }

  function netBg(val) {
    if (typeof val !== "number" || !Number.isFinite(val)) return "#f8fafc";
    return val > 0 ? "#f0fdf4" : val < 0 ? "#fef2f2" : "#f8fafc";
  }

  function netBorder(val) {
    if (typeof val !== "number" || !Number.isFinite(val)) return "#e2e8f0";
    return val > 0 ? "#bbf7d0" : val < 0 ? "#fecaca" : "#e2e8f0";
  }

  function renderMarketPulse() {
    const root = document.getElementById("home-market-pulse");
    const pulse = (typeof window !== "undefined" && window.STOCKS_MARKET_PULSE) || null;
    if (!root || !pulse) return;

    const latest = pulse.fiiDiiLatest;
    const breadth = pulse.breadth;

    const total = breadth ? Math.max(1, breadth.totalStocks || (breadth.advances + breadth.declines + breadth.unchanged)) : 1;
    const advPct = breadth ? Number(((breadth.advances / total) * 100).toFixed(1)) : 0;
    const decPct = breadth ? Number(((breadth.declines / total) * 100).toFixed(1)) : 0;
    const unchPct = breadth ? Math.max(0, Number((100 - advPct - decPct).toFixed(1))) : 0;

    const fiiCardHtml = latest
      ? `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 2px 10px rgba(15,23,42,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <div>
              <h2 style="margin:0; font-size:1.18rem; color:#0f172a; font-weight:800;">FII &amp; DII Cash Market Activity</h2>
              <p style="margin:3px 0 0 0; font-size:0.82rem; color:#64748b;">Official NSE Provisional Institutional Flows • Session: <strong>${esc(latest.dateDisplay || latest.date)}</strong></p>
            </div>
            <span style="font-size:0.8rem; font-weight:700; padding:4px 10px; border-radius:999px; background:${netBg(latest.combinedNetCr)}; color:${netColor(latest.combinedNetCr)}; border:1px solid ${netBorder(latest.combinedNetCr)};">
              Combined Net: ${fmtCr(latest.combinedNetCr)}
            </span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            <div style="background:${netBg(latest.fii && latest.fii.netCr)}; border:1px solid ${netBorder(latest.fii && latest.fii.netCr)}; border-radius:10px; padding:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.88rem; font-weight:800; color:#0f172a;">FII / FPI</span>
                <span style="font-size:1.08rem; font-weight:800; color:${netColor(latest.fii && latest.fii.netCr)};">${fmtCr(latest.fii && latest.fii.netCr)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#475569;">
                <span>Buy: <strong>${fmtUnsignedCr(latest.fii && latest.fii.buyCr)}</strong></span>
                <span>Sell: <strong>${fmtUnsignedCr(latest.fii && latest.fii.sellCr)}</strong></span>
              </div>
            </div>

            <div style="background:${netBg(latest.dii && latest.dii.netCr)}; border:1px solid ${netBorder(latest.dii && latest.dii.netCr)}; border-radius:10px; padding:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.88rem; font-weight:800; color:#0f172a;">DII (Domestic)</span>
                <span style="font-size:1.08rem; font-weight:800; color:${netColor(latest.dii && latest.dii.netCr)};">${fmtCr(latest.dii && latest.dii.netCr)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#475569;">
                <span>Buy: <strong>${fmtUnsignedCr(latest.dii && latest.dii.buyCr)}</strong></span>
                <span>Sell: <strong>${fmtUnsignedCr(latest.dii && latest.dii.sellCr)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      `
      : "";

    const breadthCardHtml = breadth
      ? `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 2px 10px rgba(15,23,42,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <div>
              <h2 style="margin:0; font-size:1.18rem; color:#0f172a; font-weight:800;">NSE &amp; BSE Market Breadth</h2>
              <p style="margin:3px 0 0 0; font-size:0.82rem; color:#64748b;">Across ${Number(breadth.totalStocks || 0).toLocaleString("en-IN")} Listed Equities • ${esc(breadth.sessionLabel)}</p>
            </div>
            <span style="font-size:0.8rem; font-weight:700; padding:4px 10px; border-radius:999px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
              A/D Ratio: ${Number(breadth.adRatio || 0).toFixed(2)}
            </span>
          </div>

          <div role="img" aria-label="Advances ${breadth.advances}, Declines ${breadth.declines}, Unchanged ${breadth.unchanged}" style="display:flex; height:12px; border-radius:999px; overflow:hidden; background:#e2e8f0; margin-bottom:10px;">
            <div style="width:${advPct}%; background:#16a34a;"></div>
            <div style="width:${unchPct}%; background:#94a3b8;"></div>
            <div style="width:${decPct}%; background:#dc2626;"></div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:14px;">
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:0.76rem; color:#166534; font-weight:700;">Advances</div>
              <div style="font-size:1.12rem; color:#16a34a; font-weight:800;">${Number(breadth.advances).toLocaleString("en-IN")} <span style="font-size:0.78rem; font-weight:600;">(${advPct}%)</span></div>
            </div>
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 12px;">
              <div style="font-size:0.76rem; color:#991b1b; font-weight:700;">Declines</div>
              <div style="font-size:1.12rem; color:#dc2626; font-weight:800;">${Number(breadth.declines).toLocaleString("en-IN")} <span style="font-size:0.78rem; font-weight:600;">(${decPct}%)</span></div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:0.76rem; color:#475569; font-weight:700;">52W High / Low</div>
              <div style="font-size:1.02rem; color:#0f172a; font-weight:800;"><span style="color:#16a34a;">${breadth.nearHigh52}</span> / <span style="color:#dc2626;">${breadth.nearLow52}</span></div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:0.76rem; color:#475569; font-weight:700;">Above 200-DMA</div>
              <div style="font-size:1.02rem; color:#0f172a; font-weight:800;">${Number(breadth.aboveDma200).toLocaleString("en-IN")} <span style="font-size:0.76rem; color:#64748b; font-weight:600;">(GC: ${breadth.goldenCrossCount})</span></div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            <div>
              <div style="font-size:0.78rem; font-weight:800; color:#166534; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:6px;">Leading Sectors</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${(breadth.topSectors || [])
                  .map(
                    (sec) => `
                  <span style="font-size:0.78rem; padding:4px 9px; border-radius:6px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; font-weight:700;">
                    ${esc(sec.sector)}: ${sec.avgChangePct >= 0 ? "+" : ""}${sec.avgChangePct.toFixed(2)}%
                  </span>
                `
                  )
                  .join("")}
              </div>
            </div>
            <div>
              <div style="font-size:0.78rem; font-weight:800; color:#991b1b; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:6px;">Lagging Sectors</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${(breadth.laggingSectors || [])
                  .map(
                    (sec) => `
                  <span style="font-size:0.78rem; padding:4px 9px; border-radius:6px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-weight:700;">
                    ${esc(sec.sector)}: ${sec.avgChangePct >= 0 ? "+" : ""}${sec.avgChangePct.toFixed(2)}%
                  </span>
                `
                  )
                  .join("")}
              </div>
            </div>
          </div>
        </div>
      `
      : "";

    root.innerHTML = `
      <div class="container" style="padding-top:20px; padding-bottom:10px;">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); border-radius:14px; padding:18px 20px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; color:#ffffff;">
          <div>
            <h2 style="margin:0; font-size:1.18rem; font-weight:800; color:#ffffff;">Closing Market Snapshot (NSE &amp; BSE)</h2>
            <p style="margin:4px 0 0 0; font-size:0.84rem; color:#cbd5e1;">Switch between NSE and BSE for tabular Indices, Sectors, FII/DII, Top Gainers/Losers, and 52W High/Low.</p>
          </div>
          <a href="market-snapshot.html" id="btn-open-market-snapshot" style="display:inline-flex; align-items:center; gap:6px; padding:10px 18px; border-radius:8px; background:#2563eb; color:#ffffff; font-weight:700; font-size:0.9rem; text-decoration:none; white-space:nowrap;">
            Open Market Snapshot &#8594;
          </a>
        </div>
        <div style="display:grid; grid-template-columns:1fr; gap:16px;">
          ${fiiCardHtml}
          ${breadthCardHtml}
        </div>
      </div>
    `;
    root.hidden = false;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderMarketPulse);
    } else {
      renderMarketPulse();
    }
  }
})();
