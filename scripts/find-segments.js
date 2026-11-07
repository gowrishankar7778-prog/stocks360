const fs = require('fs');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git' || f === 'profiles') continue;
    const p = dir + '/' + f;
    const st = fs.statSync(p);
    if (st.isDirectory()) search(p);
    else if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('Performance Segment') || c.includes('Line by Line') || c.includes('Segment (Line')) {
        console.log('FOUND IN:', p);
      }
    }
  }
}

search('.');
