const fs = require('fs');
const r = JSON.parse(fs.readFileSync('data/profiles/R.json', 'utf8'));
const reliance = r['RELIANCE'];
if (reliance) {
  console.log('RELIANCE keys:', Object.keys(reliance));
  console.log('has balanceSheet:', Array.isArray(reliance.balanceSheet), reliance.balanceSheet ? reliance.balanceSheet.length : 0);
  console.log('has cashFlows:', Array.isArray(reliance.cashFlows), reliance.cashFlows ? reliance.cashFlows.length : 0);
  console.log('has quarterlyResults:', Array.isArray(reliance.quarterlyResults), reliance.quarterlyResults ? reliance.quarterlyResults.length : 0);
  console.log('has ratios:', typeof reliance.ratios);
  console.log('has shareholding:', typeof reliance.shareholding);
} else {
  console.log('RELIANCE not in R.json!');
}
