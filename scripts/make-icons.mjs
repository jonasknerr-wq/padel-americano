// Erzeugt die PWA-Icons (PNG) ohne externe Abhängigkeiten: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0b, 0x1d, 0x17];
const BALL = [0xd7, 0xf0, 0x4a];
const SEAM = [0xff, 0xff, 0xff];

function color(x, y) {
  // Koordinaten 0..1. Ball in der Mitte (sicher für „maskable“), weiße Naht als zwei Bögen.
  const cx = 0.5, cy = 0.5, r = 0.3;
  const d = Math.hypot(x - cx, y - cy);
  if (d > r) return BG;
  const seamR = 0.26, t = 0.022;
  const dl = Math.hypot(x - (cx - 0.38), y - cy);
  const dr = Math.hypot(x - (cx + 0.38), y - cy);
  if (Math.abs(dl - seamR) < t || Math.abs(dr - seamR) < t) return SEAM;
  return BALL;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = color((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          rr += c[0]; gg += c[1]; bb += c[2];
        }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = rr / (ss * ss);
      raw[o + 1] = gg / (ss * ss);
      raw[o + 2] = bb / (ss * ss);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('Icons geschrieben.');
