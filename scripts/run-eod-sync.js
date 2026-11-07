const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cwd = path.join(__dirname, '..');
const logFile = path.join(os.tmpdir(), 'stocks360-eod-sync.log');
const polyfillPath = path.join(__dirname, 'polyfill-crypto.js');
const firebaseBin = 'C:\\Users\\gowri\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';

fs.writeFileSync(logFile, `=== Stocks 360: Full EOD Automated Synchronizer Pipeline Started at ${new Date().toISOString()} ===\n`, 'utf8');

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
      log(`<<< Finished: ${name} (exit code ${code})`);
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
  const startTime = Date.now();
  try {
    // Step 1: Ingest financial statements & statements change detection for all listed NSE stocks
    log('STEP 1/5: Syncing Comprehensive Financial Statements (P&L, Quarters, Balance Sheet, Cash Flows, Ratios, Shareholding) for All Listed Stocks...');
    await runStep(
      'Exchange Fundamentals Synchronizer (--all)',
      process.execPath,
      [path.join(__dirname, 'update-company-fundamentals.js'), '--all']
    );

    // Step 2: Build ultra-fast lightweight Screener & Search Index (screener-index.js)
    log('STEP 2/5: Generating Lightweight Screener & Search Index (screener-index.js)...');
    await runStep(
      'Lightweight Index Builder',
      process.execPath,
      [path.join(__dirname, 'build-lightweight-index.js')]
    );

    // Step 3: Refresh official regulatory announcements from NSE
    log('STEP 3/5: Syncing Official NSE Corporate Filings & Announcements...');
    await runStep(
      'NSE News & Filings Synchronizer',
      process.execPath,
      [path.join(__dirname, 'update-nse-news.js')]
    );

    // Step 4: Refresh official AMFI Mutual Funds Research Data & Daily NAVs
    log('STEP 4/5: Syncing Official AMFI Mutual Funds Research, NAVs & Risk Metrics...');
    await runStep(
      'AMFI Mutual Funds Synchronizer',
      process.execPath,
      [path.join(__dirname, 'update-mutual-funds.js')]
    );

    // Step 5: Deploy all updated statements, mutual funds, and profiles live to Firebase Hosting
    log('STEP 5/5: Deploying Updated Stock Datasets, Mutual Funds and Profiles to Firebase Hosting...');
    await runStep(
      'Live Firebase Hosting Deploy',
      process.execPath,
      ['--require', polyfillPath, firebaseBin, 'deploy', '--only', 'hosting', '--non-interactive']
    );

    const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
    log(`SUCCESS: Full EOD Synchronization completed in ${durationMin} minutes. Live at https://stocks360.web.app !`);
  } catch (err) {
    log(`FAILURE in EOD pipeline: ${err.message}`);
    process.exit(1);
  }
}

main();
