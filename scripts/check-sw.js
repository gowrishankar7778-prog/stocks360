const fs = require('fs');

function scan(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git') continue;
    const p = dir + '/' + f;
    const st = fs.statSync(p);
    if (st.isDirectory()) scan(p);
    else if (f.endsWith('.js') || f.endsWith('.html')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('serviceWorker') || c.includes('navigator.serviceWorker') || c.includes('caches.open')) {
        console.log('Found SW reference in:', p);
      }
    }
  }
}

scan('.');
console.log('SW scan complete.');
