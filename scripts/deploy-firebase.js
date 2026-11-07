const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cwd = path.join(__dirname, '..');
const logFile = path.join(os.tmpdir(), 'stocks360-firebase-deploy.log');
const polyfillPath = path.join(__dirname, 'polyfill-crypto.js');
const firebaseBin = 'C:\\Users\\gowri\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

fs.writeFileSync(logFile, `Starting Full GitHub + Firebase Hosting Deployment at ${new Date().toISOString()}...\n`, 'utf8');

// Step 1: Commit and Push to GitHub (origin/main) so GitHub Pages & Actions are 100% in sync
try {
  console.log('>>> Step 1: Syncing latest files to GitHub (origin/main)...');
  try {
    execSync('git rm --cached js/screener-data.js', { cwd, stdio: 'ignore' });
  } catch (_) {}
  execSync('git add .gitignore index.html news.html learn.html screener.html mutual-funds.html about.html contact.html firebase.json js/stock-search.js js/screener-index.js js/mutual-funds.js js/screener.js js/gemini-ai.js scripts/ data/mutual-funds/ data/profiles/ .github/workflows/', { cwd, stdio: 'inherit' });
  const status = execSync('git status --porcelain', { cwd }).toString().trim();
  if (status) {
    execSync('git commit -m "Deploy v50: Clean Company Headings, Ratio Info Buttons, Full Mutual Funds & 9:15 PM AMFI Sync"', { cwd, stdio: 'inherit' });
  }
  execSync('git push origin main', { cwd, stdio: 'inherit' });
  console.log('>>> Successfully pushed to GitHub origin/main!');
} catch (gitErr) {
  console.warn('>>> GitHub push warning:', gitErr.message);
}

// Step 2: Deploy to Firebase Hosting (stocks360.web.app)
console.log('>>> Step 2: Deploying to Firebase Hosting (stocks360.web.app)...');
const proc = spawn(process.execPath, [
  '--require',
  polyfillPath,
  firebaseBin,
  'deploy',
  '--only',
  'hosting',
  '--non-interactive'
], {
  cwd: cwd,
  env: {
    ...process.env,
    NO_UPDATE_NOTIFIER: '1',
    CI: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

proc.stdout.on('data', (d) => {
  const str = d.toString();
  process.stdout.write(str);
  try { fs.appendFileSync(logFile, str, 'utf8'); } catch (e) {}
});

proc.stderr.on('data', (d) => {
  const str = d.toString();
  process.stderr.write(str);
  try { fs.appendFileSync(logFile, str, 'utf8'); } catch (e) {}
});

proc.on('close', (code) => {
  const msg = `\nProcess exited with code ${code}\n`;
  console.log(msg);
  try { fs.appendFileSync(logFile, msg, 'utf8'); } catch (e) {}
  process.exit(code || 0);
});

proc.on('error', (err) => {
  const msg = `\nError executing firebase: ${err.message}\n`;
  console.error(msg);
  try { fs.appendFileSync(logFile, msg, 'utf8'); } catch (e) {}
  process.exit(1);
});
