const fs = require('fs');
const path = require('path');

// 1. Patch index.html
const indexPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// Replace CSS version
indexHtml = indexHtml.replace(/href="css\/styles\.css(\?v=\d+)?"/, 'href="css/styles.css?v=25"');

// Replace script versions
indexHtml = indexHtml.replace(/src="js\/firebase-config\.js(\?v=\d+)?"/, 'src="js/firebase-config.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/auth\.js(\?v=\d+)?"/, 'src="js/auth.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/data-store\.js(\?v=\d+)?"/, 'src="js/data-store.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/gemini-ai\.js(\?v=\d+)?"/, 'src="js/gemini-ai.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/main\.js(\?v=\d+)?"/, 'src="js/main.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/accessibility\.js(\?v=\d+)?"/, 'src="js/accessibility.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/screener-data\.js(\?v=\d+)?"/, 'src="js/screener-data.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/stock-search\.js(\?v=\d+)?"/, 'src="js/stock-search.js?v=25"');
indexHtml = indexHtml.replace(/src="js\/smart-assist\.js(\?v=\d+)?"/, 'src="js/smart-assist.js?v=25"');

// Add quick pick buttons and unhide stock-result
const searchSectionTarget = `          <button type="button" id="search-button" class="btn-primary">Search Company</button>
        </div>

        <!-- SEARCH RESULT CARD (DETAILED SCREENER.IN-STYLE ANALYSIS & AI GROUNDED CHAT) -->
        <section id="stock-result" class="stock-result-card" aria-live="polite" hidden></section>`;

const searchSectionReplacement = `          <button type="button" id="search-button" class="btn-primary">Search Company</button>
        </div>

        <div class="stock-quick-picks" style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px;">
          <span style="font-size:0.82rem; font-weight:600; color:#64748b;">Popular Companies:</span>
          <button type="button" class="stock-quick-pick" data-symbol="RELIANCE" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">Reliance</button>
          <button type="button" class="stock-quick-pick" data-symbol="TCS" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">TCS</button>
          <button type="button" class="stock-quick-pick" data-symbol="INFY" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">Infosys</button>
          <button type="button" class="stock-quick-pick" data-symbol="HDFCBANK" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">HDFC Bank</button>
          <button type="button" class="stock-quick-pick" data-symbol="TATAMOTORS" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">Tata Motors</button>
          <button type="button" class="stock-quick-pick" data-symbol="HSCL" style="padding:4px 12px; font-size:0.82rem; font-weight:600; border-radius:999px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; cursor:pointer;">HSCL</button>
        </div>

        <!-- SEARCH RESULT CARD (DETAILED SCREENER.IN-STYLE ANALYSIS & AI GROUNDED CHAT) -->
        <section id="stock-result" class="stock-result-card" aria-live="polite" style="display:block;"></section>`;

function safeReplace(source, target, replacement) {
  const normSource = source.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  if (!normSource.includes(normTarget)) {
    throw new Error('Target block not found in index.html');
  }
  return normSource.replace(normTarget, replacement.replace(/\r\n/g, '\n'));
}

indexHtml = safeReplace(indexHtml, searchSectionTarget, searchSectionReplacement);
fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('Successfully updated index.html');

// 2. Patch screener.html
const screenerPath = path.join(__dirname, '..', 'screener.html');
let screenerHtml = fs.readFileSync(screenerPath, 'utf8');

screenerHtml = screenerHtml.replace(/href="css\/styles\.css(\?v=\d+)?"/, 'href="css/styles.css?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/firebase-config\.js(\?v=\d+)?"/, 'src="js/firebase-config.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/auth\.js(\?v=\d+)?"/, 'src="js/auth.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/screener-data\.js(\?v=\d+)?"/, 'src="js/screener-data.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/gemini-ai\.js(\?v=\d+)?"/, 'src="js/gemini-ai.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/screener\.js(\?v=\d+)?"/, 'src="js/screener.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/accessibility\.js(\?v=\d+)?"/, 'src="js/accessibility.js?v=25"');
screenerHtml = screenerHtml.replace(/src="js\/smart-assist\.js(\?v=\d+)?"/, 'src="js/smart-assist.js?v=25"');

fs.writeFileSync(screenerPath, screenerHtml, 'utf8');
console.log('Successfully updated screener.html');
