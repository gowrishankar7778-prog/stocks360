const https = require('https');

function checkHeaders(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log('URL:', url);
      console.log('Status:', res.statusCode);
      console.log('Headers:', res.headers);
      resolve();
    });
  });
}

async function run() {
  await checkHeaders('https://stocks360.web.app/');
  await checkHeaders('https://stocks360.web.app/index.html');
  await checkHeaders('https://stocks360.web.app/js/stock-search.js?v=32');
}

run();
