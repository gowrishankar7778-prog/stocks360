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

async function run() {
  const indexRes = await fetchUrl('https://stocks360.web.app/index.html');
  console.log('index.html status:', indexRes.status);
  const match = indexRes.body.match(/stock-search\.js\?v=(\d+)/);
  console.log('index.html references stock-search.js?v=', match ? match[1] : 'not found');

  const jsRes = await fetchUrl('https://stocks360.web.app/js/stock-search.js?v=28');
  console.log('js status:', jsRes.status);
  console.log('js includes sec-balancesheet:', jsRes.body.includes('sec-balancesheet'));
  console.log('js includes sec-cashflow:', jsRes.body.includes('sec-cashflow'));
  console.log('js includes Total Borrowings:', jsRes.body.includes('Total Borrowings'));
  console.log('js length:', jsRes.body.length);
}

run().catch(console.error);
