const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const srcDir = path.join(__dirname, '..');
const downloadsDir = 'C:\\Users\\gowri\\Downloads';
const targetZip1 = path.join(downloadsDir, 'stocks-360-full-project.zip');
const targetZip2 = path.join(srcDir, 'stocks-360-full-project.zip');

console.log('Packaging stocks-360 project into ZIP...');

const res = spawnSync('tar.exe', [
  '-a',
  '-c',
  '-f',
  `"${targetZip1}"`,
  '--exclude=.git',
  '--exclude=*.log',
  '--exclude=node_modules',
  '*'
], {
  cwd: srcDir,
  shell: true,
  encoding: 'utf8'
});

if (res.error) {
  console.error('Error executing tar:', res.error);
}

if (fs.existsSync(targetZip1)) {
  fs.copyFileSync(targetZip1, targetZip2);
  const sizeMb = (fs.statSync(targetZip1).size / (1024 * 1024)).toFixed(2);
  console.log(`SUCCESS: Created ZIP archive (${sizeMb} MB)`);
  console.log(`- Path 1: ${targetZip1}`);
  console.log(`- Path 2: ${targetZip2}`);
} else {
  console.error('ZIP file was not created. Trying PowerShell Compress-Archive fallback...');
  const psCmd = `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${targetZip1}' -Force`;
  const psRes = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
  console.log('PowerShell status:', psRes.status, psRes.stderr);
  if (fs.existsSync(targetZip1)) {
    fs.copyFileSync(targetZip1, targetZip2);
    const sizeMb = (fs.statSync(targetZip1).size / (1024 * 1024)).toFixed(2);
    console.log(`SUCCESS via PowerShell: Created ZIP archive (${sizeMb} MB) at ${targetZip1}`);
  }
}
