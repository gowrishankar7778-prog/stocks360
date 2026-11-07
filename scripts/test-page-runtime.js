const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..');

// Mock browser environment
const dom = {
  hidden: false,
  style: {},
  innerHTML: '',
  value: '',
  textContent: '',
  children: [],
  setAttribute: () => {},
  removeAttribute: () => {},
  getAttribute: () => null,
  addEventListener: () => {},
  appendChild: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: (id) => {
    return {
      id,
      hidden: id === 'stock-result' ? false : true,
      style: {},
      innerHTML: '',
      value: '',
      textContent: '',
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      scrollIntoView: () => {}
    };
  },
  scrollIntoView: () => {},
  focus: () => {}
};

const sandbox = {
  console: console,
  window: {},
  document: {
    ...dom,
    body: dom,
    addEventListener: (evt, cb) => {
      if (evt === 'DOMContentLoaded') setTimeout(cb, 10);
    }
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  location: {
    search: '?symbol=RELIANCE'
  },
  URLSearchParams: URLSearchParams,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  SpeechSynthesisUtterance: function() {},
  speechSynthesis: {
    speaking: false,
    cancel: () => {},
    speak: () => {},
    getVoices: () => []
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

try {
  console.log('Loading screener-data.js...');
  const dataCode = fs.readFileSync(path.join(base, 'js', 'screener-data.js'), 'utf8');
  vm.runInContext(dataCode, ctx);
  console.log('screener-data.js loaded. Stocks count:', sandbox.STOCKS_SCREENER_DATASET ? sandbox.STOCKS_SCREENER_DATASET.length : 0);

  console.log('Loading stock-search.js...');
  const searchCode = fs.readFileSync(path.join(base, 'js', 'stock-search.js'), 'utf8');
  vm.runInContext(searchCode, ctx);
  console.log('stock-search.js loaded successfully without syntax errors!');

  // Trigger DOMContentLoaded
  setTimeout(() => {
    console.log('Waiting for search execution...');
    setTimeout(() => {
      console.log('Active company:', sandbox.activeCompanyData ? sandbox.activeCompanyData.symbol : 'none');
      const stockResult = sandbox.document.getElementById('stock-result');
      console.log('Stock result HTML length:', stockResult.innerHTML ? stockResult.innerHTML.length : 0);
      console.log('Has Quarterly Results:', stockResult.innerHTML.includes('Quarterly Results'));
      console.log('Has Balance Sheet:', stockResult.innerHTML.includes('Balance Sheet'));
      console.log('Has Profit & Loss:', stockResult.innerHTML.includes('Profit & Loss'));
      console.log('Has Cash Flows:', stockResult.innerHTML.includes('Cash Flows'));
      console.log('Has Ratios:', stockResult.innerHTML.includes('Ratios'));
      console.log('Has Shareholding:', stockResult.innerHTML.includes('Shareholding'));
    }, 300);
  }, 20);
} catch (err) {
  console.error('RUNTIME ERROR IN JS:', err);
}
