const fs = require('fs');

const dom = {
  elements: {},
  addEventListener: (event, cb) => {
    if (event === 'DOMContentLoaded') {
      dom._onLoad = cb;
    }
  },
  querySelector: (sel) => dom.elements[sel] || null,
  querySelectorAll: (sel) => [],
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
global.window.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.window.speechSynthesis = {
  getVoices: () => [],
  cancel: () => {},
  speak: () => {}
};

try {
  const screenerCode = fs.readFileSync('js/screener-data.js', 'utf8');
  eval(screenerCode);
  console.log('STOCKS_SCREENER_DATASET exists:', Array.isArray(window.STOCKS_SCREENER_DATASET));
  console.log('Count:', window.STOCKS_SCREENER_DATASET ? window.STOCKS_SCREENER_DATASET.length : 0);

  const searchCode = fs.readFileSync('js/stock-search.js', 'utf8');
  eval(searchCode);
  console.log('stock-search.js evaluated cleanly.');
  
  if (dom._onLoad) {
    dom._onLoad();
    console.log('DOMContentLoaded executed cleanly!');
    setTimeout(() => {
      const resultEl = dom.getElementById('stock-result');
      console.log('stock-result HTML length:', resultEl.innerHTML.length);
      console.log('Has sec-balancesheet:', resultEl.innerHTML.includes('sec-balancesheet'));
      console.log('Has sec-cashflow:', resultEl.innerHTML.includes('sec-cashflow'));
      console.log('Has sec-ratios:', resultEl.innerHTML.includes('sec-ratios'));
      console.log('Has sec-shareholding:', resultEl.innerHTML.includes('sec-shareholding'));
    }, 200);
  }
} catch (e) {
  console.error('Error during execution:', e);
}
