const fs = require('fs');
['js/stock-search.js', 'js/screener.js', 'js/main.js', 'js/gemini-ai.js'].forEach(file => {
  const c = fs.readFileSync(file, 'utf8');
  c.split('\n').forEach((l, i) => {
    if (/borrow/i.test(l)) {
      console.log(`${file}:${i+1}: ${l.trim()}`);
    }
  });
});
