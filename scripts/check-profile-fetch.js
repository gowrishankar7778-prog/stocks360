const https = require('https');

function check(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk.slice(0, 200));
      res.on('end', () => resolve({ status: res.statusCode, length: res.headers['content-length'], preview: data.slice(0, 100) }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

async function run() {
  console.log('R.json:', await check('https://stocks360.web.app/data/profiles/R.json'));
  console.log('T.json:', await check('https://stocks360.web.app/data/profiles/T.json'));
  console.log('news/R.json:', await check('https://stocks360.web.app/data/news/R.json'));
}

run();
