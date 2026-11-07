const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cwd = path.join(__dirname, '..');
const logFile = path.join(os.tmpdir(), 'stocks360-sync-and-deploy.log');
const polyfillPath = path.join(__dirname, 'polyfill-crypto.js');
const firebaseBin = 'C:\\Users\\gowri\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

fs.writeFileSync(logFile, `=== Starting Synchronizer & Live Deploy Pipeline at ${new Date().toISOString()} ===\n`, 'utf8');

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('en-IN')}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(logFile, line, 'utf8'); } catch (_) {}
}

async function runStep(name, cmd, args) {
  return new Promise((resolve, reject) => {
    log(`>>> Starting: ${name}...`);
    const proc = spawn(cmd, args, {
      cwd: cwd,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        CI: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', d => {
      const s = d.toString();
      process.stdout.write(s);
      try { fs.appendFileSync(logFile, s, 'utf8'); } catch (_) {}
    });

    proc.stderr.on('data', d => {
      const s = d.toString();
      process.stderr.write(s);
      try { fs.appendFileSync(logFile, s, 'utf8'); } catch (_) {}
    });

    proc.on('close', code => {
      log(`<<< Completed: ${name} (exit code ${code})`);
      if (code === 0) resolve();
      else reject(new Error(`${name} failed with code ${code}`));
    });

    proc.on('error', err => {
      log(`!!! Error in ${name}: ${err.message}`);
      reject(err);
    });
  });
}

async function main() {
  try {
    // Step 1: Run fundamental statements synchronizer for the top 50 flagship liquid equities
    await runStep(
      'Exchange Fundamentals Synchronizer (50 Stocks)',
      process.execPath,
      [path.join(__dirname, 'update-company-fundamentals.js'), '50']
    );

    // Step 2: Deploy updated screener-data.js & data shards live to Firebase Hosting
    await runStep(
      'Live Firebase Hosting Deploy',
      process.execPath,
      ['--require', polyfillPath, firebaseBin, 'deploy', '--only', 'hosting', '--non-interactive']
    );

    log('SUCCESS: All financial statements fetched, changes detected, and deployed live to https://stocks360.web.app !');
  } catch (err) {
    log(`FAILURE in pipeline: ${err.message}`);
    process.exit(1);
  }
}

main();
