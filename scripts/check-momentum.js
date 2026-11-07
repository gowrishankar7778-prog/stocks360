const fs = require('fs');
const files = fs.readdirSync('js');
files.forEach(f => {
  const c = fs.readFileSync('js/' + f, 'utf8');
  if (c.includes('Momentum') || c.includes('Line by Line') || c.includes('Performance Segment')) {
    console.log('js/' + f + ' has matches');
    c.split('\n').forEach((l, i) => {
      if (/Momentum|Line by Line|Performance Segment/i.test(l)) {
        console.log(`  ${i+1}: ${l.trim()}`);
      }
    });
  }
});
