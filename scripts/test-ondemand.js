const fs = require('fs');

const dom = {
  elements: {},
  addEventListener: (event, cb) => {
    if (event === 'DOMContentLoaded') dom._onLoad = cb;
  },
  querySelector: (sel) => dom.elements[sel] || null,
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (!dom.elements[id]) {
      dom.elements[id] = {
        id,
        style: {},
        innerHTML: '',
        textContent: '',
        addEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => '',
        removeAttribute: () => {},
        querySelectorAll: () => [],
        appendChild: () => {},
        scrollIntoView: () => {}
      };
    }
    return dom.elements[id];
  },
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    setAttribute: () => {},
    appendChild: () => {},
    querySelectorAll: () => []
  })
};

global.document = dom;
global.window = global;
global.window.document = dom;
global.window.location = { search: '' };
global.window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window.speechSynthesis = { getVoices: () => [], cancel: () => {}, speak: () => {} };
global.fetch = (url) => {
  return Promise.resolve({
    ok: true,
    json: () => {
      const match = url.match(/data\/profiles\/([^.]+)\.json/);
      if (match) {
        return JSON.parse(fs.readFileSync(`data/profiles/${match[1]}.json`, 'utf8'));
      }
      return {};
    }
  });
};

eval(fs.readFileSync('js/screener-index.js', 'utf8'));
console.log('STOCKS_SCREENER_DATASET in index:', window.STOCKS_SCREENER_DATASET.length);

eval(fs.readFileSync('js/stock-search.js', 'utf8'));

dom._onLoad();

setTimeout(() => {
  const html = dom.getElementById('stock-result').innerHTML;

  console.log('Result HTML length:', html.length);
  console.log('Contains Price Performance:', html.includes('Price Performance'));
  console.log('Contains Fundamentals:', html.includes('Fundamentals'));
  console.log('Contains Technicals:', html.includes('Technicals'));
  console.log('Contains About the Company:', html.includes('About the Company'));
  console.log('Contains Financials:', html.includes('Financials'));
  console.log('Contains News and Corporate Filings:', html.includes('News and Corporate Filings'));
  console.log('Clean Official Website without emoji:', html.includes('Official Website ↗') && !html.includes('🌐 Official Website'));
  console.log('No decorative emojis in headings:', !html.includes('📊') && !html.includes('📈') && !html.includes('🏛️') && !html.includes('💵') && !html.includes('⚖️') && !html.includes('👥'));
  console.log('Contains Quarterly:', html.includes('Quarterly Results'));
  console.log('Contains Profit & Loss:', html.includes('Profit &amp; Loss'));
  console.log('Contains Balance Sheet:', html.includes('Balance Sheet'));
  console.log('Contains Cash Flows:', html.includes('Cash Flows'));
  console.log('Contains Ratios:', html.includes('Key Financial &amp; Valuation Ratios'));
  console.log('Contains Shareholding:', html.includes('Shareholding Pattern'));

  // Check if balance sheet has actual items
  console.log('Has Equity Capital:', html.includes('Equity Capital'));
  console.log('Has Fixed Assets:', html.includes('Fixed Assets'));
  console.log('Has Cash from Operating:', html.includes('Cash from Operating Activity'));
  console.log('Has Promoters share:', html.includes('Promoters:'));
}, 400);
