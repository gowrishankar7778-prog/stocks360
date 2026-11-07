const https = require('https');
const fs = require('fs');
const path = require('path');

const outFile = path.join(__dirname, 'live-check-result.json');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  try {
    const indexRes = await fetchUrl('https://stocks360.web.app/index.html');
    const screenerRes = await fetchUrl('https://stocks360.web.app/screener.html');
    const stockSearchRes = await fetchUrl('https://stocks360.web.app/js/stock-search.js?v=21');
    const screenerDataRes = await fetchUrl('https://stocks360.web.app/js/screener-data.js?v=21');

    const result = {
      index: {
        status: indexRes.status,
        headers: indexRes.headers,
        scripts: indexRes.body.match(/<script[^>]+src=[^>]+>/g),
        hasStockSearch: indexRes.body.includes('stock-search.js')
      },
      screener: {
        status: screenerRes.status,
        scripts: screenerRes.body.match(/<script[^>]+src=[^>]+>/g)
      },
      stockSearch: {
        status: stockSearchRes.status,
        length: stockSearchRes.body.length,
        hasQuarterlyResults: stockSearchRes.body.includes('Quarterly Results'),
        hasBalanceSheet: stockSearchRes.body.includes('Balance Sheet'),
        hasProfitLoss: stockSearchRes.body.includes('Profit & Loss'),
        hasCashFlows: stockSearchRes.body.includes('Cash Flows'),
        has8KPI: stockSearchRes.body.includes('kpi-scorecard')
      },
      screenerData: {
        status: screenerDataRes.status,
        length: screenerDataRes.body.length,
        hasReliance: screenerDataRes.body.includes('RELIANCE'),
        hasFinancialsInReliance: screenerDataRes.body.includes('"quarterlyResults"') || screenerDataRes.body.includes('"financials"')
      }
    };

    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
    console.log('SUCCESS: Written check results to', outFile);
  } catch (err) {
    fs.writeFileSync(outFile, JSON.stringify({ error: err.message }, null, 2), 'utf8');
    console.error('ERROR:', err);
  }
}

main();
