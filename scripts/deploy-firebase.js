const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cwd = path.join(__dirname, '..');
const logFile = path.join(os.tmpdir(), 'stocks360-firebase-deploy.log');
const polyfillPath = path.join(__dirname, 'polyfill-crypto.js');
const firebaseBin = 'C:\\Users\\gowri\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

fs.writeFileSync(logFile, `Starting Firebase Hosting Deployment at ${new Date().toISOString()}...\n`, 'utf8');

// Run node --require polyfill-crypto.js firebase.js deploy --only hosting --non-interactive
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
