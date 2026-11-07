const fs = require('fs');
const files = ['about.html', 'ask.html', 'contact.html', 'learn.html', 'news.html', 'newsletter.html', 'screener.html'];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/stock-search\.js\?v=\d+/g, 'stock-search.js?v=35');
  content = content.replace(/screener-data\.js\?v=\d+/g, 'screener-data.js?v=35');
  content = content.replace(/gemini-ai\.js\?v=\d+/g, 'gemini-ai.js?v=35');
  content = content.replace(/styles\.css\?v=\d+/g, 'styles.css?v=35');
  fs.writeFileSync(f, content, 'utf8');
  console.log('Updated version in:', f);
});
