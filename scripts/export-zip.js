const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const cwd = path.join(__dirname, '..');
const outZipDownloads = 'C:\\Users\\gowri\\Downloads\\stocks-360-full-project.zip';
const outZipProject = path.join(cwd, 'stocks-360-full-project.zip');

try {
  // First, add all working files so HEAD / staging has everything
  execSync('git add -A', { cwd });
  execSync('git commit -m "Update: Home view, Screener.in financial statements & 4:45 PM sync"', { cwd });
} catch (e) {
  // Nothing to commit or already committed
}

// Generate ZIP via git archive
try {
  execSync(`git archive --format=zip -o "${outZipDownloads}" HEAD`, { cwd });
  fs.copyFileSync(outZipDownloads, outZipProject);
  const sizeMb = (fs.statSync(outZipDownloads).size / (1024 * 1024)).toFixed(2);
  console.log(`SUCCESS: Created ${sizeMb} MB zip archive at:`);
  console.log(`- ${outZipDownloads}`);
  console.log(`- ${outZipProject}`);
} catch (err) {
  console.error('Error running git archive:', err.message);
}
