#!/usr/bin/env node
/**
 * Market Open & Holiday Gate for GitHub Actions Workflows
 * ---------------------------------------------------------
 * 1. Maintains and reads `data/market/nse-holidays.json` (official NSE CM trading holidays).
 * 2. Determines the current date in IST (Asia/Kolkata, UTC+5:30).
 * 3. Checks if today is a weekend (Saturday/Sunday) or an official NSE holiday.
 * 4. Writes `is_open=true|false` to `$GITHUB_OUTPUT` (when running in GitHub Actions).
 *
 * Usage:
 *   node scripts/check-market-open.js          # Check today's IST trading status
 *   node scripts/check-market-open.js --sync   # Refresh data/market/nse-holidays.json from NSE API
 *   node scripts/check-market-open.js --date=2026-11-24  # Test a specific YYYY-MM-DD date
 */

const fs = require('fs');
const path = require('path');

const HOLIDAYS_FILE = path.join(__dirname, '..', 'data', 'market', 'nse-holidays.json');
const SYNC_STATE_FILE = path.join(__dirname, '..', 'data', 'market', 'sync-state.json');
const NSE_HOLIDAY_API = 'https://www.nseindia.com/api/holiday-master?type=trading';

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function parseNseDateToIso(tradingDate) {
  // Format from NSE: "24-Nov-2026"
  const parts = String(tradingDate || '').trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mon, yyyy] = parts;
  const mm = MONTHS[mon];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
}

function getIstDateInfo(overrideDate) {
  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    const [y, m, d] = overrideDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dt.getUTCDay(); // 0=Sun .. 6=Sat
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      isoDate: overrideDate,
      year: y,
      dayOfWeek,
      dayName: dayNames[dayOfWeek]
    };
  }

  const now = new Date();
  // Convert to IST (+5:30)
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istMs);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const dayOfWeek = istDate.getUTCDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    isoDate: `${year}-${month}-${day}`,
    year,
    dayOfWeek,
    dayName: dayNames[dayOfWeek]
  };
}

async function syncHolidaysFromNse() {
  console.log(`Fetching official NSE trading holidays from ${NSE_HOLIDAY_API}...`);
  const res = await fetch(NSE_HOLIDAY_API, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.nseindia.com/resources/exchange-communication-holidays'
    }
  });

  if (!res.ok) {
    throw new Error(`NSE Holiday API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const cmList = Array.isArray(data.CM) ? data.CM : [];
  if (cmList.length === 0) {
    throw new Error('NSE Holiday API returned empty CM (Equities) list');
  }

  const holidays = cmList
    .map((item) => {
      const isoDate = parseNseDateToIso(item.tradingDate);
      if (!isoDate) return null;
      return {
        date: isoDate,
        tradingDate: item.tradingDate,
        weekDay: item.weekDay,
        description: String(item.description || '').trim()
      };
    })
    .filter(Boolean);

  const years = [...new Set(holidays.map((h) => Number(h.date.slice(0, 4))))].sort();

  const payload = {
    source: 'NSE Official Trading Holiday Master (CM - Capital Market / Equities)',
    endpoint: NSE_HOLIDAY_API,
    years,
    updatedAt: new Date().toISOString(),
    count: holidays.length,
    holidays
  };

  fs.mkdirSync(path.dirname(HOLIDAYS_FILE), { recursive: true });
  fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Saved ${holidays.length} NSE trading holidays to ${path.relative(process.cwd(), HOLIDAYS_FILE)}`);
  return payload;
}

function loadLocalHolidays() {
  if (!fs.existsSync(HOLIDAYS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Failed to parse ${HOLIDAYS_FILE}: ${err.message}`);
    return null;
  }
}

function loadSyncState() {
  if (!fs.existsSync(SYNC_STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveSyncState(state) {
  fs.mkdirSync(path.dirname(SYNC_STATE_FILE), { recursive: true });
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function writeGithubOutput(key, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    fs.appendFileSync(outputPath, `${key}=${value}\n`, 'utf8');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const doSync = args.includes('--sync');
  const dateArg = args.find((a) => a.startsWith('--date='));
  const overrideDate = dateArg ? dateArg.split('=')[1] : null;
  const syncKeyArg = args.find((a) => a.startsWith('--sync-key='));
  const syncKey = syncKeyArg ? syncKeyArg.split('=')[1] : null;
  const markSyncedArg = args.find((a) => a.startsWith('--mark-synced='));
  const markSyncedKey = markSyncedArg ? markSyncedArg.split('=')[1] : null;

  const ist = getIstDateInfo(overrideDate);

  if (markSyncedKey) {
    const state = loadSyncState();
    state[markSyncedKey] = ist.isoDate;
    state[`${markSyncedKey}UpdatedAt`] = new Date().toISOString();
    saveSyncState(state);
    console.log(`Marked '${markSyncedKey}' as synced for IST date ${ist.isoDate}.`);
    return;
  }

  if (doSync) {
    await syncHolidaysFromNse();
    if (!dateArg && args.length === 1) {
      return;
    }
  }

  let holidayData = loadLocalHolidays();

  // Auto-refresh if local file is missing or doesn't cover the current year
  const coversYear = holidayData && Array.isArray(holidayData.years) && holidayData.years.includes(ist.year);
  if (!coversYear) {
    try {
      holidayData = await syncHolidaysFromNse();
    } catch (err) {
      console.warn(`Could not refresh NSE holiday list: ${err.message}. Falling back to local file if present.`);
    }
  }

  const isWeekend = ist.dayOfWeek === 0 || ist.dayOfWeek === 6;
  const holidays = Array.isArray(holidayData?.holidays) ? holidayData.holidays : [];
  const matchedHoliday = holidays.find((h) => h.date === ist.isoDate);

  const isManualDispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  let isOpen = !isWeekend && !matchedHoliday;
  let reason = 'Regular NSE/BSE trading day';

  if (isWeekend) {
    reason = `Weekend (${ist.dayName})`;
  } else if (matchedHoliday) {
    reason = `NSE Trading Holiday: ${matchedHoliday.description} (${matchedHoliday.tradingDate})`;
  }

  console.log(`IST Date: ${ist.isoDate} (${ist.dayName})`);
  console.log(`Market Status: ${isOpen ? 'OPEN' : 'CLOSED'} — ${reason}`);

  if (!isOpen && isManualDispatch) {
    console.log('Manual workflow_dispatch detected: overriding holiday gate so manual run proceeds.');
    isOpen = true;
  }

  if (isOpen && syncKey && !isManualDispatch) {
    const state = loadSyncState();
    if (state[syncKey] === ist.isoDate) {
      console.log(`Already synced '${syncKey}' for ${ist.isoDate}. Skipping redundant backup cron run.`);
      isOpen = false;
      reason = `Already synced today (${ist.isoDate})`;
    }
  }

  writeGithubOutput('is_open', isOpen ? 'true' : 'false');
  writeGithubOutput('reason', reason);
  writeGithubOutput('ist_date', ist.isoDate);
}

main().catch((err) => {
  console.error('Market check failed:', err);
  // Fail open on unexpected error so scheduled syncs are not silently broken
  writeGithubOutput('is_open', 'true');
  process.exit(0);
});
