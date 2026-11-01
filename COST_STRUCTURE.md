# Stocks 360 — Overall Cost Structure & Financial Blueprint (Website + Mobile App)

This reference file is saved inside your project root (`COST_STRUCTURE.md`) so you can review the complete cost breakdown for your **Website** and **Mobile App (Android & iOS)** at any time.

---

## 1. Service-by-Service Cost Summary (Shared Web + Mobile App Backend)

| Component | Service Used | Monthly Free Tier | Paid Rate (Only Above Free Tier) | Cost-Saving Mechanism Built into Stocks 360 |
| :--- | :--- | :--- | :--- | :--- |
| **Web Hosting & CDN** | Firebase Hosting + GitHub Pages | **10.8 GB/month FREE** (Firebase) + **100 GB/month FREE** (GitHub) | \$0.15 / GB | Lightweight static pages & local browser caching |
| **Database** | Firebase Cloud Firestore | **1 GiB storage + 50,000 reads/day (~1.5M/month) + 20,000 writes/day FREE** | \$0.06 per 100,000 reads | `localStorage` for articles + `IndexedDB` for MP3 audio (`0` repeat Firestore reads) |
| **Natural Voice Audio (TTS)** | Google Cloud Text-to-Speech (`en-IN-Neural2-A`) + Device TTS | **1,000,000 Neural2 chars/month FREE** (~200–250 articles/month) | \$16.00 / 1M chars | **Write-Once MP3 Architecture:** Synthesized once (`32 kbps Mono MP3`, ~200 KB) and shared with all Web & App users |
| **Stocks 360 AI** | Google Gemini (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) | **1,000–1,500 requests/day FREE** in Google AI Studio | ~\$0.06 per 1,000 questions | Hard daily cap (`500/day` default in Admin Settings), `260` max output tokens, session cache, and \$0 local grounded fallback |
| **Custom Domain** *(Optional)* | `.in` or `.com` Domain | `.web.app` subdomain is **FREE** | ~\$10–\$12 / year (₹850–₹1,000 / year) | Optional custom domain |

---

## 2. Mobile App Store Fees (Android & iOS)

- **Android (Google Play Console):** **\$25 USD (~₹2,100 INR)** one-time lifetime registration fee (**\$0/year** recurring).
- **iOS / iPadOS (Apple Developer Program):** **\$99 USD (~₹8,300 INR) / year** (only needed when publishing to the Apple App Store).
- **Backend & Audio Cost for the App:** **\$0 extra** — the mobile app reads from the exact same Firebase Firestore collections and pre-compressed MP3s as the website.

---

## 3. Total Monthly Cost by Traffic Stage (Web + App Combined)

1. **Stage 1 — Launch & Early Growth (Up to 10,000 monthly users):** **\$0.00 / month (₹0 / month)** — fits 100% inside the Free Tiers.
2. **Stage 2 — Medium Growth (50,000 monthly users):** **~\$5.20 / month (~₹435 / month)**.
3. **Stage 3 — High Scale (250,000+ monthly users):** **~\$23.50 – \$25.50 / month (~₹1,965 – ₹2,135 / month)**.
