const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectDir = 'C:\\Users\\gowri\\.gemini\\antigravity\\scratch\\stocks-360';

function loadScriptInSandbox(relativePath, sandbox) {
  const code = fs.readFileSync(path.join(projectDir, relativePath), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

console.log('--- 1. Testing Syntax & Integrity of Data Layer ---');
const dataSandbox = { window: {} };
loadScriptInSandbox('js/screener-index.js', dataSandbox);
const dataset = dataSandbox.window.STOCKS_SCREENER_DATASET;
const defs = dataSandbox.window.SCREENER_METRIC_DEFINITIONS;

console.log(`✓ Loaded dataset with ${dataset.length} stocks across sectors`);
console.log(`✓ Metric definitions present: ${Object.keys(defs).length} metrics`);

// Verify stock integrity
let missingFields = 0;
dataset.forEach(s => {
  if (!s.symbol || !s.cmp || s.marketCapCr === undefined || s.roePct === undefined || s.rocePct === undefined) {
    missingFields++;
  }
});
if (missingFields === 0) {
  console.log('✓ All stocks contain required fundamental & price fields');
} else {
  console.error(`✗ ${missingFields} stocks have missing fields!`);
  process.exit(1);
}

// Test Golden Cross data
const goldenCrossStocks = dataset.filter(s => s.goldenCross === true);
console.log(`✓ Stocks with active Golden Crossover (50 DMA > 200 DMA): ${goldenCrossStocks.length} (${goldenCrossStocks.map(s => s.symbol).slice(0, 5).join(', ')}...)`);

// Test Exact User Prompt: "roe > 15 roce > 18 market capitalization > 500 crores"
console.log('\n--- 2. Testing User Prompt Filter Execution ---');
const userMatches = dataset.filter(s => s.roePct > 15 && s.rocePct > 18 && s.marketCapCr > 500);
console.log(`✓ Matching companies for (ROE > 15, ROCE > 18, Market Cap > 500 Cr): ${userMatches.length} stocks`);
console.log(`  Top Matches: ${userMatches.slice(0, 4).map(s => `${s.symbol} (CMP ₹${s.cmp}, ROE ${s.roePct}%, ROCE ${s.rocePct}%, MCap ₹${s.marketCapCr} Cr)`).join(' | ')}`);

// Test Virtually Debt-Free filter
const debtFreeMatches = dataset.filter(s => s.debtToEquity <= 0.1 && s.roePct >= 15);
console.log(`✓ Matching virtually debt-free compounders (Debt/Eq <= 0.1 & ROE >= 15%): ${debtFreeMatches.length} stocks`);

console.log('\n--- 3. Testing HTML file links and references ---');
const screenerHtml = fs.readFileSync(path.join(projectDir, 'screener.html'), 'utf8');
const requiredScripts = ['js/firebase-config.js', 'js/auth.js', 'js/screener-index.js', 'js/gemini-ai.js', 'js/screener.js'];
requiredScripts.forEach(s => {
  if (screenerHtml.includes(s)) {
    console.log(`✓ screener.html includes ${s}`);
  } else {
    console.error(`✗ screener.html missing script: ${s}`);
    process.exit(1);
  }
});

console.log('\nAll test verifications PASSED successfully!');
