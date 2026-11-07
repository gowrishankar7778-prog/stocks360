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

eval(fs.readFileSync('js/screener-data.js', 'utf8'));
eval(fs.readFileSync('js/stock-search.js', 'utf8'));

dom._onLoad();

setTimeout(() => {
  const html = dom.getElementById('stock-result').innerHTML;
  
  // Extract table rows from sec-pnl
  const pnlMatch = html.match(/<section id="sec-pnl"[\s\S]*?<\/section>/);
  if (pnlMatch) {
    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g;
    let r;
    console.log('sec-pnl rows:');
    while ((r = rowRegex.exec(pnlMatch[0])) !== null) {
      console.log('  -', r[1].trim());
    }
  }

  // Extract table rows from sec-balancesheet
  const bsMatch = html.match(/<section id="sec-balancesheet"[\s\S]*?<\/section>/);
  if (bsMatch) {
    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g;
    let r;
    console.log('sec-balancesheet rows:');
    while ((r = rowRegex.exec(bsMatch[0])) !== null) {
      console.log('  -', r[1].trim());
    }
  }
}, 300);
