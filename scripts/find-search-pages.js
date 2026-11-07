const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const hasSearch = /search/i.test(c);
  const hasStockSearch = c.includes('stock-search');
  console.log(f, 'hasSearch:', hasSearch, 'hasStockSearch:', hasStockSearch);
});
