const fs = require('fs');

const dom = {
  elements: {},
  addEventListener: (event, cb) => {
    if (event === 'DOMContentLoaded') dom._onLoad = cb;
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
global.window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window.speechSynthesis = { getVoices: () => [], cancel: () => {}, speak: () => {} };

eval(fs.readFileSync('js/screener-data.js', 'utf8'));
eval(fs.readFileSync('js/stock-search.js', 'utf8'));

dom._onLoad();

setTimeout(() => {
  const html = dom.getElementById('stock-result').innerHTML;

  // Match all <section ...> and <h3>
  const matches = [];
  const secRegex = /<section\s+id="([^"]+)"[^>]*>/g;
  let m;
  while ((m = secRegex.exec(html)) !== null) {
    matches.push(m[1]);
  }

  console.log('Sections rendered in stock-result:', matches);

  // Check if any sections are inside or outside
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const h3s = [];
  while ((m = h3Regex.exec(html)) !== null) {
    h3s.push(m[1].trim());
  }
  console.log('All H3 titles in stock-result:');
  h3s.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
}, 300);
