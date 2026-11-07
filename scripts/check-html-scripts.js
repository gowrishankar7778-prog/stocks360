const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const m = c.match(/<script[^>]*stock-search[^>]*>/i);
  if (m) {
    console.log(`${f}: ${m[0]}`);
  }
});
