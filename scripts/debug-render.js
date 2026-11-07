const fs = require('fs');

global.window = global;
global.window.document = {
  getElementById: (id) => ({
    id,
    style: {},
    innerHTML: '',
    textContent: '',
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeAttribute: () => {}
  }),
  querySelector: () => ({ hidden: false }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.document = global.window.document;
global.window.location = { search: '' };
global.window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window.speechSynthesis = { getVoices: () => [], cancel: () => {}, speak: () => {} };

eval(fs.readFileSync('js/screener-data.js', 'utf8'));
eval(fs.readFileSync('js/stock-search.js', 'utf8'));

// Find a stock
const stock = window.STOCKS_SCREENER_DATASET.find(s => s.symbol === 'RELIANCE');
console.log('Stock found:', stock.name);

// Let's inspect the sections in stockResult.innerHTML
const resultEl = document.getElementById('stock-result');
// We need to trigger renderDetailedCompanyAnalysis
// In stock-search.js, renderDetailedCompanyAnalysis is in DOMContentLoaded scope
