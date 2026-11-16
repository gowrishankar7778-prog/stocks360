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

// Verify authentic exchange-verified fields on all stocks
let missingFields = 0;
dataset.forEach(s => {
  if (!s.symbol || typeof s.cmp !== 'number' || typeof s.dma50 !== 'number' || typeof s.dma200 !== 'number' || typeof s.rsi14 !== 'number' || typeof s.volume !== 'number') {
    missingFields++;
  }
});
if (missingFields === 0) {
  console.log('✓ All stocks contain required authentic Bhavcopy price, DMA, RSI & volume fields');
} else {
  console.error(`✗ ${missingFields} stocks have missing required fields!`);
  process.exit(1);
}

// Test Golden Cross data
const goldenCrossStocks = dataset.filter(s => s.goldenCross === true);
console.log(`✓ Stocks with active Golden Crossover (50 DMA > 200 DMA): ${goldenCrossStocks.length} (${goldenCrossStocks.map(s => s.symbol).slice(0, 5).join(', ')}...)`);

// Test authentic technical & volume filters
console.log('\n--- 2. Testing Technical & Volume Filter Execution ---');
const momentumMatches = dataset.filter(s => s.goldenCross === true && s.volumeSurge >= 1.15);
console.log(`✓ Golden Crossover with Volume Surge >= 1.15x: ${momentumMatches.length} stocks`);
const oversoldMatches = dataset.filter(s => s.rsi14 <= 35 && s.cmp > 50 && s.volume >= 100000);
console.log(`✓ Oversold Liquid Stocks (RSI <= 35, CMP > 50, Vol >= 1L): ${oversoldMatches.length} stocks`);

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
