const fs = require('fs');
const files = ['about.html', 'ask.html', 'contact.html', 'learn.html', 'news.html', 'newsletter.html'];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/screener-data\.js(\?v=\d+)?/g, 'screener-index.js?v=42');
  content = content.replace(/stock-search\.js\?v=\d+/g, 'stock-search.js?v=42');
  fs.writeFileSync(f, content, 'utf8');
});
console.log('Updated other pages to screener-index.js');
