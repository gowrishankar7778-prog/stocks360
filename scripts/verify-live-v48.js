const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, length: data.length, data }));
    }).on('error', reject);
  });
}

async function verify() {
  const html = await fetchUrl('https://stocks360.web.app/index.html');
  console.log('index.html status:', html.status, 'has v48:', html.data.includes('v=48'));

  const js = await fetchUrl('https://stocks360.web.app/js/stock-search.js?v=48');
  console.log('stock-search.js status:', js.status);
  console.log('Has clean Official Website ↗:', js.data.includes('Official Website ↗') && !js.data.includes('🌐 Official Website'));
  console.log('Has sec-price:', js.data.includes('sec-price'));
  console.log('Has sec-fundamentals:', js.data.includes('sec-fundamentals'));
  console.log('Has sec-technicals:', js.data.includes('sec-technicals'));
  console.log('Has sec-financials:', js.data.includes('sec-financials'));
  console.log('Has sec-filings:', js.data.includes('sec-filings'));
}

verify().catch(console.error);
