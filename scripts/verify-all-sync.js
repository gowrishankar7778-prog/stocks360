const fs = require('fs');
const path = require('path');

const idx = require('../js/screener-index.js').STOCKS_SCREENER_DATASET;
console.log('Total NSE stocks in screener-index.js:', idx.length);

const mcapCounts = {};
const cmpCounts = {};
idx.forEach(s => {
  mcapCounts[s.marketCapCr] = (mcapCounts[s.marketCapCr] || 0) + 1;
  cmpCounts[s.cmp] = (cmpCounts[s.cmp] || 0) + 1;
});
console.log('Top repeated marketCapCr:', Object.entries(mcapCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));
console.log('Top repeated cmp:', Object.entries(cmpCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));

const salesCounts = {};
const bsCounts = {};
const cfCounts = {};
const qtrCounts = {};
let totalProfiles = 0;

const files = fs.readdirSync(path.join(__dirname, '../data/profiles')).filter(f => f.endsWith('.json'));
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/profiles', f), 'utf8'));
  for (const [sym, p] of Object.entries(d)) {
    totalProfiles++;
    const sKey = p.financials && p.financials.length ? p.financials[0].sales + '|' + p.financials[p.financials.length - 1].sales : 'none';
    salesCounts[sKey] = (salesCounts[sKey] || 0) + 1;
    const bKey = p.balanceSheet && p.balanceSheet.length ? p.balanceSheet[0].totalAssets + '|' + p.balanceSheet[p.balanceSheet.length - 1].totalAssets : 'none';
    bsCounts[bKey] = (bsCounts[bKey] || 0) + 1;
    const cKey = p.cashFlows && p.cashFlows.length ? p.cashFlows[0].cfo + '|' + p.cashFlows[p.cashFlows.length - 1].cfo : 'none';
    cfCounts[cKey] = (cfCounts[cKey] || 0) + 1;
    const qKey = p.quarterlyResults && p.quarterlyResults.length ? p.quarterlyResults[0].sales + '|' + p.quarterlyResults[p.quarterlyResults.length - 1].sales : 'none';
    qtrCounts[qKey] = (qtrCounts[qKey] || 0) + 1;
  }
}

console.log('Total profiles in data/profiles/*.json:', totalProfiles);
console.log('Top repeated P&L sales:', Object.entries(salesCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));
console.log('Top repeated BS totalAssets:', Object.entries(bsCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));
console.log('Top repeated CF cfo:', Object.entries(cfCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));
console.log('Top repeated QTR sales:', Object.entries(qtrCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8));
