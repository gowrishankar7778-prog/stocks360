const fs = require('fs');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'profiles' || f === 'scripts') continue;
    const p = dir + '/' + f;
    const st = fs.statSync(p);
    if (st.isDirectory()) search(p);
    else if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css')) {
      const c = fs.readFileSync(p, 'utf8');
      if (/Performance Segment|Line by Line|OHLC Range|Momentum Indicators/i.test(c)) {
        console.log('FOUND IN:', p);
        c.split('\n').forEach((l, idx) => {
          if (/Performance Segment|Line by Line|OHLC Range|Momentum Indicators/i.test(l)) {
            console.log(`  line ${idx+1}: ${l.trim().slice(0, 100)}`);
          }
        });
      }
    }
  }
}

search('.');
