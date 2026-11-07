const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Standard CRC32 calculation
const crcTable = (function() {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(name, contentBuf) {
    const cleanName = name.replace(/\\/g, '/');
    const uncompressedSize = contentBuf.length;
    const crc = crc32(contentBuf);
    const compressedBuf = zlib.deflateRawSync(contentBuf, { level: 6 });
    const compressedSize = compressedBuf.length;

    this.files.push({
      name: cleanName,
      crc: crc,
      uncompressedSize: uncompressedSize,
      compressedSize: compressedSize,
      data: compressedBuf
    });
  }

  toBuffer() {
    const parts = [];
    let offset = 0;

    // Local headers + data
    for (const f of this.files) {
      f.offset = offset;
      const nameBuf = Buffer.from(f.name, 'utf8');
      const localHeader = Buffer.alloc(30);

      localHeader.writeUInt32LE(0x04034b50, 0); // signature
      localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
      localHeader.writeUInt16LE(0, 6);          // flags
      localHeader.writeUInt16LE(8, 8);          // compression (deflate)
      localHeader.writeUInt16LE(0x5600, 10);    // mod time
      localHeader.writeUInt16LE(0x5600, 12);    // mod date
      localHeader.writeUInt32LE(f.crc, 14);     // crc32
      localHeader.writeUInt32LE(f.compressedSize, 18);
      localHeader.writeUInt32LE(f.uncompressedSize, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);         // extra len

      parts.push(localHeader);
      parts.push(nameBuf);
      parts.push(f.data);

      offset += localHeader.length + nameBuf.length + f.compressedSize;
    }

    const centralStart = offset;

    // Central directory
    for (const f of this.files) {
      const nameBuf = Buffer.from(f.name, 'utf8');
      const cdHeader = Buffer.alloc(46);

      cdHeader.writeUInt32LE(0x02014b50, 0); // central signature
      cdHeader.writeUInt16LE(20, 4);          // version made by
      cdHeader.writeUInt16LE(20, 6);          // version needed
      cdHeader.writeUInt16LE(0, 8);           // flags
      cdHeader.writeUInt16LE(8, 10);          // compression (deflate)
      cdHeader.writeUInt16LE(0x5600, 12);     // mod time
      cdHeader.writeUInt16LE(0x5600, 14);     // mod date
      cdHeader.writeUInt32LE(f.crc, 16);
      cdHeader.writeUInt32LE(f.compressedSize, 20);
      cdHeader.writeUInt32LE(f.uncompressedSize, 24);
      cdHeader.writeUInt16LE(nameBuf.length, 28);
      cdHeader.writeUInt16LE(0, 30);          // extra len
      cdHeader.writeUInt16LE(0, 32);          // comment len
      cdHeader.writeUInt16LE(0, 34);          // disk start
      cdHeader.writeUInt16LE(0, 36);          // internal attrs
      cdHeader.writeUInt32LE(0, 38);          // external attrs
      cdHeader.writeUInt32LE(f.offset, 42);   // local header offset

      parts.push(cdHeader);
      parts.push(nameBuf);

      offset += cdHeader.length + nameBuf.length;
    }

    const centralSize = offset - centralStart;

    // End of Central Directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // disk number
    eocd.writeUInt16LE(0, 6);          // start disk
    eocd.writeUInt16LE(this.files.length, 8);  // entries on disk
    eocd.writeUInt16LE(this.files.length, 10); // total entries
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20);          // comment len

    parts.push(eocd);

    return Buffer.concat(parts);
  }
}

const rootDir = path.join(__dirname, '..');
const downloadsDir = 'C:\\Users\\gowri\\Downloads';
const targetZip1 = path.join(downloadsDir, 'stocks-360-full-project.zip');
const targetZip2 = path.join(rootDir, 'stocks-360-full-project.zip');

const zip = new SimpleZip();

// Ignore lists
const ignoreDirs = new Set(['.git', 'node_modules', '.system_generated']);
const ignoreExts = new Set(['.log', '.tmp']);

function walk(dir, relPath = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item.startsWith('.') && item !== '.firebaserc') continue;
    if (ignoreDirs.has(item)) continue;

    const fullPath = path.join(dir, item);
    const itemRel = relPath ? `${relPath}/${item}` : item;
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath, itemRel);
    } else {
      const ext = path.extname(item).toLowerCase();
      if (ignoreExts.has(ext)) continue;
      if (item === 'stocks-360-full-project.zip') continue;

      const buf = fs.readFileSync(fullPath);
      zip.addFile(itemRel, buf);
    }
  }
}

console.log('Collecting project files...');
walk(rootDir);
console.log(`Zipping ${zip.files.length} project files...`);

const zipBuffer = zip.toBuffer();
fs.writeFileSync(targetZip1, zipBuffer);
fs.writeFileSync(targetZip2, zipBuffer);

const mb = (zipBuffer.length / (1024 * 1024)).toFixed(2);
console.log(`SUCCESS! Created valid ZIP file (${mb} MB):`);
console.log(`1. Downloads: ${targetZip1}`);
console.log(`2. Project: ${targetZip2}`);
