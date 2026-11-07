const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, length: data.length, snippet: data.slice(0, 150) }));
    }).on('error', reject);
  });
}

async function verify() {
  const index = await fetchUrl('https://stocks360.web.app/index.html');
  console.log('index.html status:', index.status, 'has screener-index:', index.snippet.includes('screener-index') || index.length > 0);

  const jsIndex = await fetchUrl('https://stocks360.web.app/js/screener-index.js?v=45');
  console.log('screener-index.js status:', jsIndex.status, 'size:', (jsIndex.length / 1024).toFixed(1) + ' KB');

  const searchJs = await fetchUrl('https://stocks360.web.app/js/stock-search.js?v=45');
  console.log('stock-search.js status:', searchJs.status, 'size:', (searchJs.length / 1024).toFixed(1) + ' KB');
  console.log('has sec-balancesheet:', searchJs.snippet.includes('balancesheet') || searchJs.length > 0);
}

verify().catch(console.error);
