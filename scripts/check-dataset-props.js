const fs = require('fs');

global.window = {};
const code = fs.readFileSync('js/screener-data.js', 'utf8');
eval(code);

const dataset = window.STOCKS_SCREENER_DATASET;
let missingDma = 0;
let missingCmp = 0;
let missingRsi = 0;

dataset.forEach(s => {
  if (typeof s.dma50 !== 'number') missingDma++;
  if (typeof s.cmp !== 'number') missingCmp++;
  if (typeof s.rsi14 !== 'number') missingRsi++;
});

console.log('Total stocks:', dataset.length);
console.log('Missing dma50:', missingDma);
console.log('Missing cmp:', missingCmp);
console.log('Missing rsi14:', missingRsi);
