# Stocks 360 — Complete System Architecture, UI, and Infrastructure Documentation
**Version:** 2.4.0 (Build 104)  
**Date of Document:** 24 November 2026  
**Repository:** `https://github.com/gowrishankar7778-prog/stocks360.git`  
**Production Live URL:** `https://stocks360.web.app`  

---

## 1. Executive Summary & Core Philosophy
Stocks 360 is an enterprise-grade, institutional-quality Indian equity research, mutual funds, and technical analysis platform. It is engineered with three core principles:
1. **100% Authentic Official Exchange Data:** Zero fabricated or synthesized numbers. Data is derived directly from the National Stock Exchange of India (NSE), Bombay Stock Exchange (BSE), and the Association of Mutual Funds in India (AMFI).
2. **Zero Recurring Infrastructure Cost:** Built on serverless, static, high-performance architecture utilizing GitHub Actions runners, Firebase Hosting CDN, and lightweight JSON data shards.
3. **Accessibility First (WCAG 2.1 AAA Compliant):** True WAI-ARIA tabbed navigation, roving keyboard tabindex, screen-reader focus management, and high-contrast support.

---

## 2. Platform Architecture & Data Pipeline

```
+---------------------------------------------------------------------------------+
|                               Official Upstream Sources                         |
|  - NSE UDiFF EOD Bhavcopy ZIPs (Daily Prices, OHLC, Traded Volume)              |
|  - NSE sec_bhavdata_full (Security-wise Deliverable Quantity & Delivery %)      |
|  - NSE Corporate Filings (SEBI XBRL Disclosures, LODR Shareholding Pattern)     |
|  - BSE Equities Daily Bhavcopy                                                  |
|  - AMFI Daily NAV Master (NAVAll.txt - 2,260+ active mutual fund schemes)       |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                       Automated GitHub Actions Orchestrator                     |
|                                                                                 |
|  [4:37 PM IST] daily-stock-sync.yml                                             |
|    1. Verify Trading Day (Skip Weekends & NSE Holidays via nse-holidays.json)    |
|    2. Auto-Discover New NSE IPOs & Equity Listings                              |
|    3. Append EOD Bhavcopy Bar to 220-Day Rolling Cache (nse-ohlcv-history)      |
|    4. Calculate 16 MAs (5, 10, 20, 26, 30, 50, 100, 200 SMA/EMA) & Oscillators  |
|    5. Sync BSE Bhavcopy & Update Fundamentals / Corporate Announcements         |
|    6. Git Commit, Pull Rebase, & Push to GitHub Main                             |
|    7. Trigger Render Webhook (Optional Backend)                                  |
|                                                                                 |
|  [6:43 PM IST] daily-deals-sync.yml                                             |
|    1. Fetch NSE Bulk Deals & Block Deals                                        |
|    2. Fetch SEBI PIT Insider Trading Disclosures                                |
|    3. Sync Market Pulse & FII/DII Flows                                         |
|                                                                                 |
|  [9:32 PM IST] daily-mutual-funds-sync.yml                                      |
|    1. Parse official AMFI NAVs for 2,260+ schemes across 40+ AMCs               |
|    2. Recalculate Trailing Returns (1M, 3M, 6M, 1Y, 3Y, 5Y) & Risk Ratios        |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                       Persistent Storage & File Formats                         |
|  - js/screener-index.js (3.12 MB): Search index & screener metrics for 5,300+   |
|  - data/profiles/<A-Z, 0-9>.json: Sharded company profiles (Technicals, QVT,    |
|    Financial Statements, Quarterly Balance Sheet, Cash Flows, Shareholding)     |
|  - data/market/nse-ohlcv-history.json.gz (8.53 MB): 220-day OHLCV price cache   |
|  - data/mutual-funds/top-mutual-funds.json: Schemes, NAVs, and risk ratios     |
|  - data/market/nse-holidays.json: Exchange gazetted trading holidays            |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                    Client-Side UI (Firebase Hosting CDN)                        |
|  - index.html (Homepage & Global Stock Search)                                  |
|  - screener.html (Custom Multi-Factor Screener & Preset Strategies)             |
|  - mutual-funds.html (Mutual Fund Explorer, AMC Schemes, Risk Analytics)        |
|  - ipo.html (Mainboard & SME IPO Tracking, Subscription Status)                 |
|  - deals.html (Daily Bulk/Block Deals & Insider Disclosures)                    |
+---------------------------------------------------------------------------------+
```

---

## 3. User Interface & Page Specifications

### 3.1. Company Analysis (Inside `index.html` & `js/stock-search.js`)
When a stock is selected from search, the page transitions into a focused tabbed workspace (`role="tablist"`):
- **Hero Header:**
  - Exchange Badge (NSE / BSE), Sector, and clean `Company Website` link.
  - Live EOD Closing Price, Day Change (₹ and %), Session timestamp.
  - **See this in Institutional Holdings:** Accessible modal window (`role="dialog"`, `aria-modal="true"`) displaying non-promoter institutions holding $\ge 1\%$ stake (Domestic Institutions like LIC/SBI MF, Foreign Portfolio Investors like Govt of Singapore), QoQ trends, and direct links to mutual fund schemes.
  - Clean links for `Latest Annual Report PDF` and `NSE Annual Reports Archive` (no arrow icons or technical jargon).
  - Audio Readout button (`Listen to About the Company`).
- **Tab 1: Overview:**
  - About the Company, Price Performance Summary (Open, High, Low, 52W High, 52W Low, Volume, Delivery %).
- **Tab 2: Fundamentals:**
  - Audited Financial Metrics: Market Cap, P/E, P/B, Industry P/E, ROE %, ROCE %, Debt to Equity, EPS, Book Value, Dividend Yield, Face Value.
- **Tab 3: Technicals & QVT:**
  - **Stocks 360 QVT Score Card:** Overall QVT score out of 100 with Quality, Value, and Technical Momentum breakdown.
  - **Overall Technical Rating Banner:** e.g., *Strong Bullish (13 of 16 Moving Averages Bullish)*.
  - **Moving Averages Table:** 5-Day, 10-Day, 20-Day, 26-Day, 30-Day, 50-Day, 100-Day, and 200-Day with both **SMA** and **EMA** values and Bullish/Bearish verdicts.
  - **Indicators Table:** 14-Day RSI, MACD (12, 26, 9), Bollinger Bands (20, 2), ADX (14) with +DI/-DI, ATR (14), Stochastic (14, 3), ROC (14-Day), and Delivery % & Volume Surge.
  - **Fibonacci & Pivot Table:** 0% to 100% Fibonacci Retracement Levels with active support zone and Classic Daily Pivot Points (PP, R1–R3, S1–S3).
- **Tab 4: Financial Statements:**
  - Audited Quarterly Results (Sales, EBITDA, PBT, Net Profit, EPS).
  - Annual Profit & Loss Statement (Multi-year CAGR).
  - Balance Sheet (Share Capital, Reserves, Borrowings, Total Assets).
  - Cash Flows (Operating Cash Flow CFO, Investing CFI, Financing CFF).
- **Tab 5: Shareholding Pattern:**
  - Quarterly trends across Promoters, FIIs, DIIs (Mutual Funds, Insurance), and Public.
- **Tab 6: Filings & News:**
  - Official exchange disclosures and board announcements.
- **Tab 7: Peer Comparison:**
  - Sector peer table comparing P/E, Market Cap, ROCE, and 1-year returns.

### 3.2. Mutual Funds Explorer (`mutual-funds.html` & `js/mutual-funds.js`)
- **AMC Selector & Category Filters:** Large Cap, Mid Cap, Small Cap, Flexi Cap, ELSS, Debt, Arbitrage, Index Funds.
- **Scheme Overview Tab:**
  - Pinned scheme header with category, NAV, and Direct/Regular plan dropdown.
  - Trailing Returns (1M, 3M, 6M, 1Y, 3Y, 5Y, Since Inception).
  - Clean links to AMC Website, Scheme Information Document (SID), and AMFI NAV Archive.
- **Risk & Volatility Ratios Tab:**
  - Standard Deviation, Sharpe Ratio, Sortino Ratio, Beta, and Alpha.
- **Official Documents Tab:**
  - Regulatory filings and statutory links.

### 3.3. Multi-Factor Stock Screener (`screener.html` & `js/screener.js`)
- Filter across **34 institutional metrics** (Fundamental, Valuation, Technical, and Volume).
- **Featured Technical Strategies:**
  - *Golden Crossover with Volume Surge (50 DMA > 200 DMA)*
  - *Oversold Liquid Equities (RSI <= 35, Volume >= 1 Lakh)*
  - *MACD Bullish & Strong Trend (ADX >= 25, Bullish MAs >= 10)*
  - *20 & 50 EMA Bullish Momentum (CMP > 20 EMA, 50 EMA > 200 EMA)*
  - *High ROE & Low Debt Quality Compounders*

---

## 4. Quantitative Scoring: The Stocks 360 QVT Engine

Each pillar is scored **0 to 100** and strictly normalized over available verified data:
$$\text{Pillar Score} = \text{round}\left(\frac{\text{Points Earned}}{\text{Available Points}} \times 100\right)$$
$$\text{Overall QVT} = \text{round}\left(\frac{Q + V + T}{\text{Available Pillars}}\right)$$

### 4.1. Quality (Q) — 100 Points Max
- **Return Efficiency (25 pts):** ROE $\ge 20\%$ (15 pts), ROCE $\ge 20\%$ (10 pts). For Banks: ROE $\ge 16\%$ (25 pts).
- **Multi-Year Growth (25 pts):** Sales CAGR $\ge 15\%$ (12 pts), PAT CAGR $\ge 15\%$ (13 pts).
- **Cash Flow Conversion (20 pts):** Proportion of audited years with positive Operating Cash Flow (CFO).
- **Leverage (15 pts):** Debt to Equity $\le 0.25$ (15 pts), $\le 0.50$ (12 pts), $\le 1.0$ (8 pts).
- **Ownership Stability (15 pts):** Promoter $\ge 30\%$ or Institutional $\ge 40\%$ (8 pts) + Stable promoter holding (7 pts).

### 4.2. Value (V) — 100 Points Max
- **Industry Peer-Relative P/E (40 pts):** Stock P/E divided by Industry Peer Average P/E. Ratio $\le 0.70$ awards full 40 pts.
- **Absolute P/E (30 pts):** P/E $\le 12$ (30 pts), $\le 18$ (25 pts), $\le 25$ (19 pts).
- **Price-to-Book (30 pts):** P/B $\le 1.5$ (30 pts), $\le 2.5$ (25 pts), $\le 4.0$ (19 pts).

### 4.3. Technical Momentum (T) — 100 Points Max
- **Moving Average Breadth (30 pts):** Proportion of 16 MAs (5, 10, 20, 26, 30, 50, 100, 200 SMA & EMA) where CMP > MA.
- **MACD (12, 26, 9) Momentum (12 pts):** Positive histogram awards 12 pts, zero awards 6 pts, negative awards 2 pts.
- **ADX (14) Trend Strength & Direction (8 pts):** ADX $\ge 25$ with $+DI > -DI$ awards 8 pts.
- **52-Week Range Position (20 pts):** `(CMP - 52W Low) / (52W High - 52W Low) × 20`.
- **14-Day Wilder RSI (15 pts):** RSI between 50 and 70 awards full 15 pts.
- **Volume Surge (8 pts):** Day's volume relative to 10-day average ($\ge 1.25x$ awards 8 pts).
- **Delivery % (7 pts):** Proportion of shares delivered to demat accounts ($\ge 50\%$ awards 7 pts).

---

## 5. Critical Infrastructure & Automation Schedules

| Workflow | File | Trigger Time (IST) | Cron (UTC) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Daily Stock Sync** | `.github/workflows/daily-stock-sync.yml` | **4:37 PM IST** (Mon–Fri) | `7 11 * * 1-5` | Synchronize NSE Bhavcopy, update 220-day OHLCV, compute 16 MAs, Indicators, Fibonacci, Pivots, Corporate Filings, and QVT scores. |
| **Daily Deals Sync** | `.github/workflows/daily-deals-sync.yml` | **6:43 PM IST** (Mon–Fri) | `13 13 * * 1-5` | Fetch official NSE Bulk/Block deals and SEBI Insider Trading disclosures. |
| **Daily Mutual Funds** | `.github/workflows/daily-mutual-funds-sync.yml` | **9:32 PM IST** (Mon–Fri) | `2 16 * * 1-5` | Synchronize AMFI daily NAVs across all mutual fund schemes. |

### 5.1. Holiday Gate & Off-Peak Anti-Lag
- **Off-Peak Minutes:** Configured at non-standard minutes (`:37`, `:43`, `:32`) to bypass GitHub Actions runner queue congestion, eliminating 45–60 minute start delays.
- **Automated Holiday Gate (`scripts/check-market-open.js`):** Checks `data/market/nse-holidays.json`. Skips runs on weekends and NSE trading holidays. Auto-refreshes for future years from NSE's official API.

---

## 6. Deployment & Hosting Operations
- **Hosting Platform:** Firebase Hosting (`stocks360.web.app`) backed by Google Global Edge CDN.
- **Configuration (`firebase.json`):**
  - Static caching headers for images, CSS, and JS.
  - Rewrites pointing clean single-page routes to appropriate HTML files.
- **Local Deployment Command:**
  ```powershell
  $env:NODE_OPTIONS="--experimental-global-webcrypto"; firebase deploy --only hosting
  ```

---

## 7. Versioning & Change Management Protocol
When any modification or feature addition occurs:
1. Increment the application build version (`v=10X`) in HTML and script tags for cache busting.
2. Run integrity test suites (`test-screener.js`, `verify-company-tabs.js`).
3. Commit and push to `origin/main` on GitHub.
4. Auto-update this central documentation master file.
5. Export a fresh copy to the user's local `Downloads` directory upon request.
