const fs = require('fs');
const css = fs.readFileSync('css/styles.css', 'utf8');
css.split('\n').forEach((l, i) => {
  if (/stock-search-card|top-search-section/i.test(l)) {
    console.log(`styles.css:${i+1}: ${l.trim().slice(0, 100)}`);
  }
});
