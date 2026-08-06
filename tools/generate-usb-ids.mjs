// Regenerates public/vault/usb-ids.json.gz from the public usb.ids database
// (http://www.linux-usb.org/usb.ids) for the vault's Peripherals panel.
// Shipped pre-gzipped like the geo mmdb (Cloudflare Pages does not compress
// these assets itself); src/vault/lib/usbids.js inflates it in the browser.
//
//   node tools/generate-usb-ids.mjs [path-to-usb.ids]
//
// With no argument the current list is downloaded. Output shape, keyed by
// lowercase hex vendor id:  { "046d": ["Logitech, Inc.", { "c08b": "G502 HERO
// Gaming Mouse", ... }], ... }  — the products object is omitted for vendors
// with no product entries, so consume it as `const [vendor, products] = db[vid] || []`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SOURCE_URL = 'http://www.linux-usb.org/usb.ids';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vault', 'usb-ids.json.gz');

// Vendors verifiably in real-world use but missing from upstream usb.ids.
const VENDOR_OVERRIDES = {
  '3434': 'Keychron', // Keychron's QMK-registered VID, used by all their boards
  '31e3': 'Wooting',
};

const text = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : Buffer.from(await (await fetch(SOURCE_URL)).arrayBuffer()).toString('utf8');

const db = {};
let vendor = null;
let version = 'unknown';
for (const line of text.split(/\r?\n/)) {
  const vm = /^# Version:\s*(\S+)/.exec(line);
  if (vm) version = vm[1];
  if (line.startsWith('#') || !line.trim()) continue;
  // The vendor/device section ends where the class/usage tables begin.
  if (/^[A-Z]+ /.test(line)) break;
  let m;
  if ((m = /^([0-9a-f]{4}) {2}(.+)$/.exec(line))) {
    vendor = m[1];
    const prevProducts = db[vendor]?.[1]; // duplicate vendor line: keep collected products, last name wins
    db[vendor] = prevProducts ? [m[2].trim(), prevProducts] : [m[2].trim()];
  } else if (vendor && (m = /^\t([0-9a-f]{4}) {2}(.+)$/.exec(line))) {
    (db[vendor][1] ||= {})[m[1]] = m[2].trim();
  }
  // Deeper-indented interface lines are deliberately skipped.
}
for (const [vid, name] of Object.entries(VENDOR_OVERRIDES)) db[vid] ||= [name];

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(db);
const gz = gzipSync(Buffer.from(json), { level: 9 });
writeFileSync(OUT, gz);
const vendors = Object.keys(db).length;
const products = Object.values(db).reduce((n, [, p]) => n + (p ? Object.keys(p).length : 0), 0);
console.log(`usb-ids.json.gz: ${vendors} vendors, ${products} products, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB raw → ${(gz.length / 1024).toFixed(0)} KB gz (source version ${version})`);
