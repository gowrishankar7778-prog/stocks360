/**
 * Stocks 360 - Mutual Funds Research, AMC Explorer & Scheme Overview Controller
 * Displays official AMFI scheme NAVs, plan variants, and AMFI/MFAPI historical CAGR & NAV risk ratios.
 */

(function () {
  const RISK_RATIO_DEFINITIONS = {
    "Standard Deviation": "Standard Deviation measures the annualized volatility of the mutual fund's daily NAV returns over the trailing 1-year window. A lower Standard Deviation indicates steadier returns.",
    "Sharpe Ratio": "Sharpe Ratio measures risk-adjusted return — excess annualized NAV return above the 6.5% risk-free rate per unit of annualized Standard Deviation. Higher is better.",
    "Sortino Ratio": "Sortino Ratio measures excess annualized NAV return per unit of downside deviation (negative daily returns only). A higher Sortino Ratio indicates stronger downside protection."
  };

  const AMC_WEBSITES = {
    "HDFC": "https://www.hdfcfund.com",
    "SBI": "https://www.sbimf.com",
    "ICICI": "https://www.icicipruamc.com",
    "PPFAS": "https://amc.ppfas.com",
    "Nippon": "https://mf.nipponindiaim.com",
    "Kotak": "https://www.kotakmf.com",
    "Axis": "https://www.axismf.com",
    "Quant": "https://www.quantmutual.com",
    "Mirae": "https://www.miraeassetmf.co.in",
    "UTI": "https://www.utimf.com",
    "Aditya Birla": "https://mutualfund.adityabirlacapital.com",
    "DSP": "https://www.dspim.com",
    "Tata": "https://www.tatamutualfund.com",
    "Motilal": "https://www.motilaloswalmf.com",
    "Bandhan": "https://bandhanmutual.com",
    "Edelweiss": "https://www.edelweissmf.com",
    "Franklin": "https://www.franklintempletonindia.com",
    "HSBC": "https://www.assetmanagement.hsbc.co.in",
    "Invesco": "https://www.invescomutualfund.com",
    "Canara": "https://www.canararobeco.com",
    "Sundaram": "https://www.sundarammutual.com",
    "LIC": "https://www.licmf.com",
    "Bajaj Finserv": "https://www.bajajamc.com",
    "Zerodha": "https://www.zerodhafundhouse.com",
    "Helios": "https://www.heliosmf.in",
    "WhiteOak": "https://mf.whiteoakamc.com",
    "360 ONE": "https://www.360.one/asset-management/mutual-fund",
    "PGIM": "https://www.pgimindiamf.com",
    "Mahindra": "https://www.mahindramanulife.com",
    "Baroda BNP": "https://www.barodabnpparibasmf.in",
    "Union": "https://www.unionmf.com",
    "ITI": "https://www.itiamc.com",
    "JM Financial": "https://www.jmfinancialmf.com",
    "Groww": "https://www.growwmf.in",
    "Navi": "https://bfsi.navi.com",
    "Quantum": "https://www.quantumamc.com",
    "Samco": "https://www.samcomf.com",
    "Trust": "https://www.trustmf.com",
    "NJ": "https://www.njmutualfund.com",
    "Bank of India": "https://www.boimf.in",
    "Shriram": "https://www.shriramamc.in",
    "Taurus": "https://www.taurusmutualfund.com",
    "Old Bridge": "https://www.oldbridgemf.com",
    "Angel One": "https://www.angelonemf.com",
    "Jio BlackRock": "https://www.amfiindia.com",
    "Capitalmind": "https://www.capitalmindmf.com",
    "Unifi": "https://www.unifimf.com"
  };

  function getAmcOfficialLinks(fundHouse) {
    const fh = String(fundHouse || "");
    let websiteUrl = "https://www.amfiindia.com/research-information/other-data/scheme-details";
    for (const [key, url] of Object.entries(AMC_WEBSITES)) {
      if (fh.toLowerCase().includes(key.toLowerCase())) {
        websiteUrl = url;
        break;
      }
    }
    return {
      websiteUrl,
      sidUrl: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doMutualFund=yes&type=1",
      amfiUrl: "https://www.amfiindia.com/net-asset-value/nav-history"
    };
  }

  let allFunds = [];
  let activeScheme = null;
  let activePlanCode = null;
  let activeAmc = null;
  let currentSuggestions = [];
  let activeSuggestionIndex = -1;
  const mfApiCache = new Map();

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function announceA11y(text) {
    if (typeof window.speakText === "function" && localStorage.getItem("stocks360_special_a11y") === "true") {
      window.speakText(text, true);
    }
  }

  function parseMfApiDate(ddmmyyyy) {
    const parts = String(ddmmyyyy || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return Date.UTC(parts[2], parts[1] - 1, parts[0]);
  }

  async function fetchAndComputeMfApiMetrics(schemeCode) {
    const code = String(schemeCode || "").trim();
    if (!code) return null;
    if (mfApiCache.has(code)) {
      return mfApiCache.get(code);
    }

    const promise = fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const rows = json && Array.isArray(json.data) ? json.data : [];
        if (rows.length < 2) {
          return { returns: {}, riskRatios: null, status: "unavailable" };
        }

        const latestNav = parseFloat(rows[0].nav);
        const latestMs = parseMfApiDate(rows[0].date);
        if (!latestNav || !latestMs) {
          return { returns: {}, riskRatios: null, status: "unavailable" };
        }

        const findNavDaysAgo = (days) => {
          const targetMs = latestMs - days * 86400000;
          for (let j = 0; j < rows.length; j++) {
            const dMs = parseMfApiDate(rows[j].date);
            if (dMs !== null && dMs <= targetMs) {
              const v = parseFloat(rows[j].nav);
              return v > 0 ? { nav: v, years: (latestMs - dMs) / (365.25 * 86400000) } : null;
            }
          }
          return null;
        };

        const absRet = (days) => {
          const ref = findNavDaysAgo(days);
          return ref ? Number((((latestNav / ref.nav) - 1) * 100).toFixed(1)) : null;
        };
        const cagrRet = (days) => {
          const ref = findNavDaysAgo(days);
          if (!ref || ref.years < 0.5) return null;
          return Number(((Math.pow(latestNav / ref.nav, 1 / ref.years) - 1) * 100).toFixed(1));
        };

        const r1M = absRet(30);
        const r3M = absRet(91);
        const r6M = absRet(182);
        const r1Y = absRet(365);
        const r3Y = cagrRet(365 * 3);
        const r5Y = cagrRet(365 * 5);

        const oldest = rows[rows.length - 1];
        const oldestNav = parseFloat(oldest.nav);
        const oldestMs = parseMfApiDate(oldest.date);
        let rIncep = null;
        if (oldestNav > 0 && oldestMs !== null) {
          const yrs = (latestMs - oldestMs) / (365.25 * 86400000);
          if (yrs >= 1) {
            rIncep = Number(((Math.pow(latestNav / oldestNav, 1 / yrs) - 1) * 100).toFixed(1));
          }
        }

        const returns = {};
        if (r1M !== null) returns["1M"] = r1M;
        if (r3M !== null) returns["3M"] = r3M;
        if (r6M !== null) returns["6M"] = r6M;
        if (r1Y !== null) returns["1Y"] = r1Y;
        if (r3Y !== null) returns["3Y"] = r3Y;
        if (r5Y !== null) returns["5Y"] = r5Y;
        if (rIncep !== null) returns.inception = rIncep;

        let riskRatios = null;
        const recent = rows.slice(0, Math.min(253, rows.length)).map((r) => parseFloat(r.nav)).filter((v) => v > 0).reverse();
        if (recent.length >= 60) {
          const dailyRets = [];
          for (let k = 1; k < recent.length; k++) {
            dailyRets.push((recent[k] - recent[k - 1]) / recent[k - 1]);
          }
          const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
          const variance = dailyRets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (dailyRets.length - 1);
          const stdDev = Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2));
          const downRets = dailyRets.filter((r) => r < 0);
          const downVar = downRets.length > 1
            ? downRets.reduce((a, b) => a + Math.pow(b, 2), 0) / downRets.length
            : variance;
          const downDev = Math.sqrt(downVar) * Math.sqrt(252) * 100;
          const annRet = r1Y !== null ? r1Y : (mean * 252 * 100);
          const rf = 6.5;
          const sharpe = stdDev > 0 ? Number(((annRet - rf) / stdDev).toFixed(2)) : null;
          const sortino = downDev > 0 ? Number(((annRet - rf) / downDev).toFixed(2)) : null;

          riskRatios = {
            ...(stdDev > 0 ? { stdDev } : {}),
            ...(sharpe !== null ? { sharpe } : {}),
            ...(sortino !== null ? { sortino } : {})
          };
        }

        return {
          returns,
          riskRatios,
          latestNav,
          latestDate: rows[0].date,
          status: "loaded"
        };
      })
      .catch(() => ({ returns: {}, riskRatios: null, status: "unavailable" }));

    mfApiCache.set(code, promise);
    return promise;
  }

  function getAmcList() {
    const map = {};
    allFunds.forEach((f) => {
      if (!map[f.fundHouse]) {
        map[f.fundHouse] = {
          fundHouse: f.fundHouse,
          amcShort: f.amcShort || f.fundHouse.replace(" Mutual Fund", ""),
          schemes: []
        };
      }
      map[f.fundHouse].schemes.push(f);
    });
    return Object.values(map);
  }

  function renderQuickPills() {
    const topPillsContainer = document.getElementById("mf-top-quick-pills");
    if (!topPillsContainer) return;

    const topFunds = allFunds.filter((f) => f.isTopQuickPill);
    topPillsContainer.innerHTML = topFunds
      .map((f) => {
        const isSelected = activeScheme && activeScheme.schemeCode === f.schemeCode;
        return `<button type="button" class="quick-ticker-pill mf-quick-scheme-btn" data-code="${escapeHtml(f.schemeCode)}" style="cursor:pointer; padding:6px 14px; font-size:0.84rem; font-weight:${isSelected ? "700" : "600"}; border-radius:20px; background:${isSelected ? "#2563eb" : "#f8fafc"}; color:${isSelected ? "#ffffff" : "#1e293b"}; border:1px solid ${isSelected ? "#2563eb" : "#cbd5e1"}; transition:all 0.15s ease;">
          ${escapeHtml(f.shortName)}
        </button>`;
      })
      .join("");
  }

  function renderAmcSchemesView(fundHouseName) {
    activeAmc = fundHouseName;
    activeScheme = null;
    activePlanCode = null;
    renderQuickPills();

    const amcSection = document.getElementById("mf-amc-results-section");
    const overviewSection = document.getElementById("mf-scheme-overview-section");
    if (!amcSection) return;

    const matchingSchemes = allFunds.filter(
      (f) =>
        f.fundHouse.toLowerCase() === fundHouseName.toLowerCase() ||
        (f.amcShort && f.amcShort.toLowerCase() === fundHouseName.toLowerCase()) ||
        f.fundHouse.toLowerCase().includes(fundHouseName.toLowerCase())
    );

    if (matchingSchemes.length === 0) {
      amcSection.hidden = true;
      return;
    }

    const displayAmcTitle = matchingSchemes[0].fundHouse;
    amcSection.hidden = false;
    if (overviewSection) overviewSection.hidden = true;

    try {
      history.pushState({ amc: fundHouseName }, "", `mutual-funds.html?amc=${encodeURIComponent(fundHouseName)}`);
    } catch (_) {}

    amcSection.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; margin-bottom:24px; box-shadow:0 1px 4px rgba(15,23,42,0.04);">
        <div class="focused-nav-bar" role="navigation" aria-label="AMC navigation">
          <div class="focused-nav-group">
            <button type="button" id="mf-amc-back-btn" class="nav-back-btn primary-back" aria-label="Go back to mutual fund search">
              <span aria-hidden="true">&#8592;</span> Go Back to Mutual Funds Search &amp; All AMCs
            </button>
            <a href="index.html" class="nav-back-btn" aria-label="Go back to Stocks 360 homepage">
              <span aria-hidden="true">&#8592;</span> Go Back to Home
            </a>
          </div>
          <span class="focused-nav-hint">Press Esc to clear</span>
        </div>

        <div style="margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
          <h2 style="font-size:1.3rem; color:#0f172a; margin:0; font-weight:700;">
            ${escapeHtml(displayAmcTitle)} (${matchingSchemes.length} Schemes)
          </h2>
        </div>

        <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
          <table style="width:100%; border-collapse:collapse; min-width:640px; font-size:0.9rem;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
                <th style="padding:11px 14px; color:#1e293b; font-weight:700;">Scheme Name</th>
                <th style="padding:11px 14px; color:#1e293b; font-weight:700;">Category</th>
                <th style="padding:11px 14px; color:#1e293b; font-weight:700;">AMFI Code</th>
                <th style="padding:11px 14px; color:#1e293b; font-weight:700; text-align:center;">Plans</th>
                <th style="padding:11px 14px; color:#1e293b; font-weight:700; text-align:right;">Latest NAV (₹)</th>
                <th style="padding:11px 14px; color:#1e293b; font-weight:700; text-align:right;">NAV Date</th>
              </tr>
            </thead>
            <tbody>
              ${matchingSchemes
                .map(
                  (s, i) => `
                <tr class="mf-amc-scheme-row" data-code="${escapeHtml(s.schemeCode)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(s.name)}" style="cursor:pointer; background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
                  <td style="padding:12px 14px; font-weight:700; color:#2563eb;">${escapeHtml(s.name)}</td>
                  <td style="padding:12px 14px; color:#475569;">${escapeHtml(s.category)}</td>
                  <td style="padding:12px 14px; color:#475569;">${escapeHtml(s.schemeCode)}</td>
                  <td style="padding:12px 14px; text-align:center; color:#475569;">${Array.isArray(s.plans) ? s.plans.length : 1}</td>
                  <td style="padding:12px 14px; text-align:right; font-weight:600; color:#0f172a;">₹ ${Number(s.nav).toFixed(4)}</td>
                  <td style="padding:12px 14px; text-align:right; color:#64748b;">${escapeHtml(s.navDate || "--")}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    announceA11y(`Showing ${matchingSchemes.length} schemes maintained by ${displayAmcTitle}.`);

    const amcBackBtn = document.getElementById("mf-amc-back-btn");
    if (amcBackBtn) {
      amcBackBtn.addEventListener("click", function (e) {
        e.preventDefault();
        closeAmcView();
      });
    }
  }

  function buildRiskCardsHtml(riskRatios, isLoading) {
    const riskCardsData = [
      {
        name: "Standard Deviation",
        val: isLoading ? "Loading..." : (riskRatios && riskRatios.stdDev !== undefined && riskRatios.stdDev !== null ? `${riskRatios.stdDev}%` : "--"),
        color: "#0f172a"
      },
      {
        name: "Sharpe Ratio",
        val: isLoading ? "Loading..." : (riskRatios && riskRatios.sharpe !== undefined && riskRatios.sharpe !== null ? `${riskRatios.sharpe}` : "--"),
        color: riskRatios && riskRatios.sharpe > 0 ? "#16a34a" : "#0f172a"
      },
      {
        name: "Sortino Ratio",
        val: isLoading ? "Loading..." : (riskRatios && riskRatios.sortino !== undefined && riskRatios.sortino !== null ? `${riskRatios.sortino}` : "--"),
        color: riskRatios && riskRatios.sortino > 0 ? "#16a34a" : "#0f172a"
      }
    ];

    return riskCardsData
      .map(
        (r) => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <span style="display:block; font-size:0.78rem; color:#64748b; font-weight:600; text-transform:uppercase;">${escapeHtml(r.name)}</span>
          <strong style="display:block; font-size:1.25rem; color:${r.color}; margin-top:4px; font-weight:700;">${escapeHtml(r.val)}</strong>
        </div>
        <div style="margin-top:10px;">
          <button type="button" class="ratio-info-toggle-btn" aria-expanded="false" style="cursor:pointer; font-size:0.75rem; font-weight:600; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:4px 10px;">
            ${escapeHtml(r.name)} Information
          </button>
          <div class="ratio-info-box" hidden style="margin-top:6px; padding:8px 10px; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; font-size:0.78rem; color:#334155; line-height:1.45;">
            ${escapeHtml(RISK_RATIO_DEFINITIONS[r.name])}
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  function renderSchemeOverview(scheme) {
    if (!scheme) return;
    activeScheme = scheme;
    renderQuickPills();

    try {
      history.pushState({ scheme: scheme.schemeCode }, "", `mutual-funds.html?scheme=${encodeURIComponent(scheme.schemeCode)}`);
    } catch (_) {}

    const overviewSection = document.getElementById("mf-scheme-overview-section");
    if (!overviewSection) return;
    overviewSection.hidden = false;

    const plans = Array.isArray(scheme.plans) && scheme.plans.length > 0
      ? scheme.plans
      : [{ code: scheme.schemeCode, plan: "Direct Plan - Growth", nav: scheme.nav, date: scheme.navDate || "Latest" }];

    let currentReturns = (scheme.returns && Object.keys(scheme.returns).length > 0) ? scheme.returns : null;
    let currentRisk = (scheme.riskRatios && Object.keys(scheme.riskRatios).length > 0) ? scheme.riskRatios : null;
    let currentPlanCode = String(plans[0].code);
    activePlanCode = currentPlanCode;

    const officialLinks = getAmcOfficialLinks(scheme.fundHouse);
    const hasInitialMetrics = Boolean(currentReturns || currentRisk);

    overviewSection.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 1px 6px rgba(15,23,42,0.04);">

        <div class="focused-nav-bar" role="navigation" aria-label="Mutual Fund Overview navigation">
          <div class="focused-nav-group">
            <button type="button" id="mf-back-to-search-btn" class="nav-back-btn primary-back" aria-label="Go back to mutual fund search and AMCs">
              <span aria-hidden="true">&#8592;</span> Go Back to Mutual Funds Search &amp; AMCs
            </button>
            <a href="index.html" class="nav-back-btn" aria-label="Go back to Stocks 360 homepage">
              <span aria-hidden="true">&#8592;</span> Go Back to Home
            </a>
          </div>
          <span class="focused-nav-hint">Press Esc to return</span>
        </div>

        <!-- HEADING 1: MUTUAL FUND CORE SCHEME -->
        <section id="mf-sec-core" style="margin-bottom:32px;">
          <h2 style="font-size:1.25rem; color:#0f172a; margin:0 0 16px 0; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
            Mutual Fund Core Scheme
          </h2>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:18px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:0.84rem; color:#64748b; font-weight:600; margin-bottom:6px;">
                  <span>${escapeHtml(scheme.fundHouse)} &bull; ${escapeHtml(scheme.category)} &bull; AMFI Code: <span id="mf-live-scheme-code">${escapeHtml(currentPlanCode)}</span></span>
                  <a href="${escapeHtml(officialLinks.websiteUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.78rem; color:#2563eb; font-weight:700; text-decoration:none; padding:2px 8px; border-radius:4px; background:#eff6ff; border:1px solid #bfdbfe;">
                    Official AMC Website ↗
                  </a>
                  <a href="${escapeHtml(officialLinks.sidUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.78rem; color:#1e293b; font-weight:600; text-decoration:none; padding:2px 8px; border-radius:4px; background:#ffffff; border:1px solid #cbd5e1;">
                    Scheme Information Document (SID) ↗
                  </a>
                </div>
                <h3 id="mf-live-scheme-title" style="font-size:1.5rem; color:#0f172a; margin:0; font-weight:800;">
                  ${escapeHtml(scheme.name)}
                </h3>
              </div>

              <div style="text-align:right;">
                <span id="mf-live-nav-date" style="display:block; font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase;">NAV (${escapeHtml(plans[0].date || scheme.navDate || "Latest")})</span>
                <strong id="mf-live-nav-val" style="display:block; font-size:1.55rem; font-weight:800; color:#0f172a; margin-top:2px;">
                  ₹ ${Number(plans[0].nav || scheme.nav).toFixed(4)}
                </strong>
              </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;">
              <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
                <div style="min-width:240px;">
                  <label for="mf-plan-combo" style="display:block; font-size:0.82rem; font-weight:600; color:#475569; margin-bottom:6px;">
                    Plan / Option (${plans.length} Official AMFI ${plans.length === 1 ? "Plan" : "Plans"})
                  </label>
                  <select id="mf-plan-combo" style="padding:9px 14px; font-size:0.9rem; font-weight:600; color:#0f172a; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; width:100%;">
                    ${plans
                      .map(
                        (pl, idx) =>
                          `<option value="${idx}">${escapeHtml(pl.plan)} — ₹${Number(pl.nav).toFixed(2)} (Code: ${escapeHtml(pl.code)})</option>`
                      )
                      .join("")}
                  </select>
                </div>

                <div style="min-width:200px;">
                  <label for="mf-period-combo" style="display:block; font-size:0.82rem; font-weight:600; color:#475569; margin-bottom:6px;">
                    Return Period
                  </label>
                  <select id="mf-period-combo" style="padding:9px 14px; font-size:0.92rem; font-weight:600; color:#0f172a; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; width:100%;">
                    <option value="1M">1 Month</option>
                    <option value="3M">3 Months</option>
                    <option value="6M">6 Months</option>
                    <option value="1Y">1 Year</option>
                    <option value="3Y" selected>3 Years</option>
                    <option value="5Y">5 Years</option>
                    <option value="inception">Since Inception</option>
                  </select>
                </div>
              </div>

              <div id="mf-period-combo-output" aria-live="polite" style="display:flex; gap:24px; flex-wrap:wrap; align-items:center;"></div>
            </div>
          </div>

          <div>
            <h3 style="font-size:1.1rem; color:#0f172a; margin:0 0 8px 0; font-weight:700;">
              About the Scheme
            </h3>
            <p style="font-size:0.93rem; color:#334155; line-height:1.65; margin:0 0 12px 0;">
              ${escapeHtml(scheme.about)}${scheme.objective ? ` ${escapeHtml(scheme.objective)}` : ""}
            </p>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
              <a href="${escapeHtml(officialLinks.websiteUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:6px 12px; border-radius:6px; text-decoration:none;">
                Visit Official ${escapeHtml(scheme.amcShort || scheme.fundHouse)} Scheme Portal ↗
              </a>
              <a href="${escapeHtml(officialLinks.sidUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:600; color:#334155; background:#f8fafc; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; text-decoration:none;">
                View Official SEBI Scheme Information Document (SID) ↗
              </a>
              <a href="${escapeHtml(officialLinks.amfiUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:600; color:#334155; background:#f8fafc; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; text-decoration:none;">
                Official AMFI NAV Archive ↗
              </a>
            </div>
          </div>
        </section>

        <!-- HEADING 2: RISK RATIOS (NAV-DERIVED ONLY) -->
        <section id="mf-sec-risk" style="margin-bottom:8px;">
          <h2 style="font-size:1.25rem; color:#0f172a; margin:0 0 14px 0; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
            NAV Volatility &amp; Risk Ratios (1-Year Daily NAV)
          </h2>
          <div id="mf-risk-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            ${buildRiskCardsHtml(currentRisk, !hasInitialMetrics)}
          </div>
        </section>

      </div>
    `;

    const planCombo = document.getElementById("mf-plan-combo");
    const periodCombo = document.getElementById("mf-period-combo");
    const periodOutput = document.getElementById("mf-period-combo-output");
    const riskGrid = document.getElementById("mf-risk-cards-grid");

    function updatePeriodComboOutput(periodKey, isLoading) {
      if (!periodOutput) return;
      const isAnnualized = periodKey === "1Y" || periodKey === "3Y" || periodKey === "5Y" || periodKey === "inception";
      const val = currentReturns && currentReturns[periodKey] !== undefined && currentReturns[periodKey] !== null
        ? Number(currentReturns[periodKey])
        : null;

      let displayStr = "--";
      let color = "#64748b";
      if (isLoading && val === null) {
        displayStr = "Loading from MFAPI...";
        color = "#475569";
      } else if (val !== null && !isNaN(val)) {
        const sign = val > 0 ? "+" : "";
        displayStr = `${sign}${val}%${isAnnualized ? " p.a." : ""}`;
        color = val > 0 ? "#16a34a" : val < 0 ? "#dc2626" : "#0f172a";
      }

      periodOutput.innerHTML = `
        <div>
          <span style="display:block; font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">
            ${isAnnualized ? "NAV Return (CAGR)" : "Absolute NAV Return"}
          </span>
          <strong style="font-size:1.35rem; color:${color}; font-weight:800;">
            ${escapeHtml(displayStr)}
          </strong>
        </div>
      `;
    }

    async function hydrateMfApiForPlan(code) {
      const pKey = periodCombo ? periodCombo.value : "3Y";
      const result = await fetchAndComputeMfApiMetrics(code);
      if (!activeScheme || activeScheme.schemeCode !== scheme.schemeCode || String(activePlanCode) !== String(code)) {
        return;
      }
      if (result) {
        if (result.returns && Object.keys(result.returns).length > 0) {
          currentReturns = result.returns;
          if (String(code) === String(scheme.schemeCode)) {
            scheme.returns = result.returns;
          }
        }
        if (result.riskRatios) {
          currentRisk = result.riskRatios;
          if (String(code) === String(scheme.schemeCode)) {
            scheme.riskRatios = result.riskRatios;
          }
        }
      }
      updatePeriodComboOutput(periodCombo ? periodCombo.value : pKey, false);
      if (riskGrid) {
        riskGrid.innerHTML = buildRiskCardsHtml(currentRisk, false);
      }
    }

    updatePeriodComboOutput(periodCombo ? periodCombo.value : "3Y", !hasInitialMetrics);
    if (!hasInitialMetrics || !currentReturns || Object.keys(currentReturns).length === 0) {
      hydrateMfApiForPlan(currentPlanCode);
    }

    if (planCombo) {
      planCombo.addEventListener("change", function () {
        const selectedPlan = plans[parseInt(this.value, 10)];
        if (!selectedPlan) return;
        currentPlanCode = String(selectedPlan.code);
        activePlanCode = currentPlanCode;

        const navValEl = document.getElementById("mf-live-nav-val");
        const navDateEl = document.getElementById("mf-live-nav-date");
        const codeEl = document.getElementById("mf-live-scheme-code");
        const titleEl = document.getElementById("mf-live-scheme-title");
        if (navValEl) navValEl.textContent = `₹ ${Number(selectedPlan.nav).toFixed(4)}`;
        if (navDateEl) navDateEl.textContent = `NAV (${selectedPlan.date || "Latest"})`;
        if (codeEl) codeEl.textContent = selectedPlan.code;
        if (titleEl) titleEl.textContent = `${scheme.shortName || scheme.name} - ${selectedPlan.plan}`;

        currentReturns = null;
        currentRisk = null;
        updatePeriodComboOutput(periodCombo ? periodCombo.value : "3Y", true);
        if (riskGrid) riskGrid.innerHTML = buildRiskCardsHtml(null, true);
        hydrateMfApiForPlan(currentPlanCode);
      });
    }

    if (periodCombo) {
      periodCombo.addEventListener("change", function () {
        updatePeriodComboOutput(this.value, !currentReturns);
      });
    }

    const backSearchBtn = document.getElementById("mf-back-to-search-btn");
    if (backSearchBtn) {
      backSearchBtn.addEventListener("click", function (e) {
        e.preventDefault();
        closeSchemeOverview();
      });
    }
  }

  function closeSchemeOverview() {
    const overviewSection = document.getElementById("mf-scheme-overview-section");
    const amcSection = document.getElementById("mf-amc-results-section");
    const searchInput = document.getElementById("mf-search");
    if (overviewSection) {
      overviewSection.hidden = true;
      overviewSection.innerHTML = "";
    }
    activeScheme = null;
    activePlanCode = null;
    renderQuickPills();
    if (amcSection && amcSection.innerHTML.trim() !== "" && !amcSection.hidden) {
      amcSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      if (searchInput) searchInput.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    try {
      history.pushState({}, "", "mutual-funds.html");
    } catch (_) {}
  }

  function closeAmcView() {
    const amcSection = document.getElementById("mf-amc-results-section");
    const searchInput = document.getElementById("mf-search");
    if (amcSection) {
      amcSection.hidden = true;
      amcSection.innerHTML = "";
    }
    activeAmc = null;
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    try {
      history.pushState({}, "", "mutual-funds.html");
    } catch (_) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildSuggestions(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];

    const results = [];
    const amcs = getAmcList();

    amcs.forEach((a) => {
      if (a.fundHouse.toLowerCase().includes(q) || a.amcShort.toLowerCase().includes(q)) {
        results.push({
          type: "amc",
          title: `${a.fundHouse}`,
          subtitle: `View all ${a.schemes.length} schemes maintained by ${a.amcShort}`,
          amcName: a.fundHouse
        });
      }
    });

    allFunds.forEach((f) => {
      const planMatch = Array.isArray(f.plans) && f.plans.some((pl) => String(pl.code).includes(q));
      if (
        f.name.toLowerCase().includes(q) ||
        f.shortName.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.fundHouse.toLowerCase().includes(q) ||
        String(f.schemeCode).includes(q) ||
        planMatch
      ) {
        results.push({
          type: "scheme",
          title: f.name,
          subtitle: `${f.fundHouse} • ${f.category} • NAV: ₹${Number(f.nav).toFixed(2)}`,
          schemeCode: f.schemeCode
        });
      }
    });

    return results.slice(0, 12);
  }

  function renderSuggestionsDropdown() {
    const listEl = document.getElementById("mf-search-suggestions");
    const inputEl = document.getElementById("mf-search");
    if (!listEl || !inputEl) return;

    if (currentSuggestions.length === 0) {
      listEl.hidden = true;
      inputEl.setAttribute("aria-expanded", "false");
      return;
    }

    listEl.hidden = false;
    inputEl.setAttribute("aria-expanded", "true");

    listEl.innerHTML = currentSuggestions
      .map((item, idx) => {
        const isActive = idx === activeSuggestionIndex;
        const badge = item.type === "amc" ? "AMC" : "Fund";
        return `
        <li
          id="mf-sug-item-${idx}"
          role="option"
          aria-selected="${isActive ? "true" : "false"}"
          class="mf-suggestion-row"
          data-idx="${idx}"
          style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #f1f5f9; background:${isActive ? "#eff6ff" : "#ffffff"}; display:flex; justify-content:space-between; align-items:center; gap:10px;"
        >
          <div>
            <div style="font-size:0.92rem; font-weight:700; color:#0f172a;">${escapeHtml(item.title)}</div>
            <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${escapeHtml(item.subtitle)}</div>
          </div>
          <span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:6px; background:#f1f5f9; color:#334155; white-space:nowrap;">
            ${badge}
          </span>
        </li>
      `;
      })
      .join("");

    if (activeSuggestionIndex >= 0) {
      const activeRow = document.getElementById(`mf-sug-item-${activeSuggestionIndex}`);
      if (activeRow && typeof activeRow.scrollIntoView === "function") {
        activeRow.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function selectSuggestion(item) {
    const listEl = document.getElementById("mf-search-suggestions");
    const inputEl = document.getElementById("mf-search");
    if (listEl) listEl.hidden = true;
    if (inputEl) inputEl.setAttribute("aria-expanded", "false");

    if (!item) return;

    if (item.type === "amc") {
      if (inputEl) inputEl.value = item.amcName;
      renderAmcSchemesView(item.amcName);
      const amcSec = document.getElementById("mf-amc-results-section");
      if (amcSec) amcSec.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (item.type === "scheme") {
      const found = allFunds.find((f) => f.schemeCode === item.schemeCode);
      if (found) {
        if (inputEl) inputEl.value = found.shortName || found.name;
        const amcSec = document.getElementById("mf-amc-results-section");
        if (amcSec) amcSec.hidden = true;
        renderSchemeOverview(found);
        const overviewEl = document.getElementById("mf-scheme-overview-section");
        if (overviewEl) overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function executeFreeTextSearch(rawQuery) {
    const q = String(rawQuery || "").trim();
    if (!q) return;

    const suggestions = buildSuggestions(q);
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]);
    }
  }

  function bindEvents() {
    const input = document.getElementById("mf-search");
    const searchBtn = document.getElementById("mf-search-btn");
    const suggestionsEl = document.getElementById("mf-search-suggestions");

    if (input) {
      input.addEventListener("input", function () {
        currentSuggestions = buildSuggestions(this.value);
        activeSuggestionIndex = currentSuggestions.length > 0 ? 0 : -1;
        renderSuggestionsDropdown();
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") {
          if (currentSuggestions.length === 0) {
            currentSuggestions = buildSuggestions(this.value);
          }
          if (currentSuggestions.length > 0) {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
            renderSuggestionsDropdown();
          }
        } else if (e.key === "ArrowUp") {
          if (currentSuggestions.length > 0) {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
            renderSuggestionsDropdown();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (suggestionsEl && !suggestionsEl.hidden && activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
            selectSuggestion(currentSuggestions[activeSuggestionIndex]);
          } else {
            executeFreeTextSearch(this.value);
          }
        } else if (e.key === "Escape") {
          if (suggestionsEl) suggestionsEl.hidden = true;
          input.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (searchBtn && input) {
      searchBtn.addEventListener("click", function () {
        if (suggestionsEl) suggestionsEl.hidden = true;
        executeFreeTextSearch(input.value);
      });
    }

    if (suggestionsEl) {
      suggestionsEl.addEventListener("click", function (e) {
        const li = e.target.closest(".mf-suggestion-row");
        if (!li) return;
        const idx = parseInt(li.getAttribute("data-idx"), 10);
        if (!isNaN(idx) && currentSuggestions[idx]) {
          selectSuggestion(currentSuggestions[idx]);
        }
      });
    }

    document.addEventListener("click", function (e) {
      if (suggestionsEl && !suggestionsEl.hidden) {
        if (!e.target.closest("#mf-search") && !e.target.closest("#mf-search-suggestions")) {
          suggestionsEl.hidden = true;
          if (input) input.setAttribute("aria-expanded", "false");
        }
      }

      const ratioBtn = e.target.closest(".ratio-info-toggle-btn");
      if (ratioBtn && e.target.closest("#mf-scheme-overview-section")) {
        e.preventDefault();
        const box = ratioBtn.nextElementSibling;
        if (box && box.classList.contains("ratio-info-box")) {
          const isHidden = box.hasAttribute("hidden");
          if (isHidden) {
            box.removeAttribute("hidden");
            ratioBtn.setAttribute("aria-expanded", "true");
            announceA11y(box.textContent);
          } else {
            box.setAttribute("hidden", "");
            ratioBtn.setAttribute("aria-expanded", "false");
          }
        }
        return;
      }

      const quickSchemeBtn = e.target.closest(".mf-quick-scheme-btn");
      if (quickSchemeBtn) {
        e.preventDefault();
        const code = quickSchemeBtn.getAttribute("data-code");
        const found = allFunds.find((f) => f.schemeCode === code);
        if (found) {
          const amcSec = document.getElementById("mf-amc-results-section");
          if (amcSec) amcSec.hidden = true;
          if (input) input.value = found.shortName || found.name;
          renderSchemeOverview(found);
          const overviewEl = document.getElementById("mf-scheme-overview-section");
          if (overviewEl) overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      const schemeRow = e.target.closest(".mf-amc-scheme-row");
      if (schemeRow) {
        const code = schemeRow.getAttribute("data-code");
        const found = allFunds.find((f) => f.schemeCode === code);
        if (found) {
          const amcSec = document.getElementById("mf-amc-results-section");
          if (amcSec) amcSec.hidden = true;
          renderSchemeOverview(found);
          const overviewEl = document.getElementById("mf-scheme-overview-section");
          if (overviewEl) overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      const schemeRow = e.target.closest(".mf-amc-scheme-row");
      if (schemeRow) {
        e.preventDefault();
        const code = schemeRow.getAttribute("data-code");
        const found = allFunds.find((f) => f.schemeCode === code);
        if (found) {
          const amcSec = document.getElementById("mf-amc-results-section");
          if (amcSec) amcSec.hidden = true;
          renderSchemeOverview(found);
          const overviewEl = document.getElementById("mf-scheme-overview-section");
          if (overviewEl) overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") {
        const openBox = document.querySelector(".ratio-info-box:not([hidden])");
        if (openBox) {
          openBox.setAttribute("hidden", "");
          const toggleBtn = openBox.previousElementSibling;
          if (toggleBtn && toggleBtn.classList.contains("ratio-info-toggle-btn")) {
            toggleBtn.setAttribute("aria-expanded", "false");
            toggleBtn.focus();
          }
          return;
        }

        if (suggestionsEl && !suggestionsEl.hidden) {
          suggestionsEl.hidden = true;
          if (input) input.setAttribute("aria-expanded", "false");
          return;
        }

        const overviewEl = document.getElementById("mf-scheme-overview-section");
        if (overviewEl && !overviewEl.hidden && overviewEl.innerHTML.trim() !== "") {
          closeSchemeOverview();
          return;
        }

        const amcEl = document.getElementById("mf-amc-results-section");
        if (amcEl && !amcEl.hidden && amcEl.innerHTML.trim() !== "") {
          closeAmcView();
          return;
        }
      }
    });

    window.addEventListener("popstate", function () {
      const p = new URLSearchParams(window.location.search);
      const schemeParam = p.get("scheme");
      const amcParam = p.get("amc");

      if (schemeParam) {
        const found = allFunds.find(
          (f) => String(f.schemeCode) === String(schemeParam) ||
                 f.name.toLowerCase() === schemeParam.toLowerCase() ||
                 f.shortName.toLowerCase() === schemeParam.toLowerCase()
        );
        if (found) renderSchemeOverview(found);
      } else if (amcParam) {
        renderAmcSchemesView(amcParam);
      } else {
        const overviewSection = document.getElementById("mf-scheme-overview-section");
        if (overviewSection) {
          overviewSection.hidden = true;
          overviewSection.innerHTML = "";
        }
        const amcSection = document.getElementById("mf-amc-results-section");
        if (amcSection) {
          amcSection.hidden = true;
          amcSection.innerHTML = "";
        }
        if (input) input.value = "";
      }
    });
  }

  function init() {
    bindEvents();

    fetch("data/mutual-funds/top-mutual-funds.json?v=62")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        allFunds = data.funds || [];
        renderQuickPills();

        const params = new URLSearchParams(window.location.search);
        const amcParam = params.get("amc");
        const schemeParam = params.get("scheme");
        if (amcParam) {
          renderAmcSchemesView(amcParam);
        } else if (schemeParam) {
          const found = allFunds.find(
            (f) => String(f.schemeCode) === String(schemeParam) ||
                   f.name.toLowerCase() === schemeParam.toLowerCase() ||
                   f.shortName.toLowerCase() === schemeParam.toLowerCase()
          );
          if (found) {
            const input = document.getElementById("mf-search");
            if (input) input.value = found.shortName || found.name;
            renderSchemeOverview(found);
            const overviewEl = document.getElementById("mf-scheme-overview-section");
            if (overviewEl) overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      })
      .catch(() => {
        const overviewSection = document.getElementById("mf-scheme-overview-section");
        if (overviewSection) {
          overviewSection.hidden = false;
          overviewSection.innerHTML = `<div style="padding:20px; background:#fef2f2; color:#991b1b; border-radius:8px;">Unable to load mutual funds data feed. Please refresh the page.</div>`;
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
