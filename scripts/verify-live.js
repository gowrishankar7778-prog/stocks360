const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function verify() {
  const index = await fetchUrl('https://stocks360.web.app/index.html');
  console.log('index.html status:', index.status);
  console.log('index includes stock-search.js?v=32:', index.body.includes('stock-search.js?v=32'));
  console.log('index includes no-cache meta:', index.body.includes('no-cache, no-store'));

  const js = await fetchUrl('https://stocks360.web.app/js/stock-search.js?v=32');
  console.log('stock-search.js?v=32 status:', js.status);
  console.log('includes Total Borrowings (Debt):', js.body.includes('Total Borrowings (Debt)'));
  console.log('includes sec-balancesheet:', js.body.includes('sec-balancesheet'));
  console.log('includes sec-cashflow:', js.body.includes('sec-cashflow'));
  console.log('includes sec-ratios:', js.body.includes('sec-ratios'));
  console.log('includes sec-shareholding:', js.body.includes('sec-shareholding'));
  console.log('includes stocks360_gemini_profile_v4_:', js.body.includes('stocks360_gemini_profile_v4_'));
}

verify().catch(console.error);
