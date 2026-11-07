const fs = require('fs');
const c = fs.readFileSync('js/screener.js', 'utf8');
c.split('\n').forEach((l, i) => {
  if (/financial|profit|revenue|borrowing|modal|detail/i.test(l)) {
    console.log(`screener.js:${i+1}: ${l.trim().slice(0, 100)}`);
  }
});
