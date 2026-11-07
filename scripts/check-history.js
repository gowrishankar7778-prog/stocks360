const { execSync } = require('child_process');

try {
  const log = execSync('git log -S "OPM" --oneline -n 10', { encoding: 'utf8' });
  console.log('Commits mentioning OPM:', log);
  
  const show = execSync('git show HEAD~1:js/stock-search.js', { encoding: 'utf8', maxBuffer: 5*1024*1024 });
  console.log('HEAD~1 length:', show.length);
  console.log('HEAD~1 has sec-balancesheet:', show.includes('sec-balancesheet'));
} catch (e) {
  console.error(e.message);
}
