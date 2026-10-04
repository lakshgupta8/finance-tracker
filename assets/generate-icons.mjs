// =============================================================================
// ICON GENERATOR
// Renders the app icon (the credit-card glyph from client/public/favicon.svg,
// the same artwork as the original icon.ico) into every raster size the two
// shells need:
//   assets/icon.ico              -> Windows exe / window icon (256..16 px)
//   assets/icon-256.png          -> reference PNG
//   mobile/assets/icon.png       -> Android legacy launcher icon (1024, white bg)
//   mobile/assets/icon-foreground.png / icon-background.png -> adaptive icon
//   mobile/assets/splash.png / splash-dark.png -> launch screens
// Uses `sharp` that ships with @capacitor/assets (installed under mobile/).
// Run from the repo root:  node assets/generate-icons.mjs
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(root, 'mobile', 'package.json'));
const sharp = require('sharp');

const BLACK = '#000000';
const WHITE = '#ffffff';
const DARK = '#0a0a0a';

const svgSource = readFileSync(join(root, 'client', 'public', 'favicon.svg'), 'utf8');

/** The favicon uses currentColor; pin the stroke colour explicitly. */
function glyphSvg(color) {
    return Buffer.from(svgSource.replace(/currentColor/g, color));
}

async function glyphPng(size, color) {
    return sharp(glyphSvg(color)).resize(size, size).png().toBuffer();
}

/** Solid canvas with the glyph centred, glyph scaled to `ratio` of the canvas. */
async function composed(canvas, bg, color, ratio) {
    const glyphSize = Math.round(canvas * ratio);
    const glyph = await glyphPng(glyphSize, color);
    return sharp({ create: { width: canvas, height: canvas, channels: 4, background: bg } })
        .composite([{ input: glyph, gravity: 'centre' }])
        .png()
        .toBuffer();
}

// Windows .ico: transparent background, black stroke (matches the original icon.ico)
async function buildIco() {
    const sizes = [256, 128, 64, 48, 32, 16];
    const pngs = await Promise.all(sizes.map((s) => glyphPng(s, BLACK)));

    // ICO container: header + directory entries + PNG payloads (PNG-in-ICO is
    // supported by Windows Vista and later for every size).
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);         // reserved
    header.writeUInt16LE(1, 2);         // type: icon
    header.writeUInt16LE(sizes.length, 4);

    const dirSize = 16 * sizes.length;
    let offset = 6 + dirSize;
    const entries = [];
    for (let i = 0; i < sizes.length; i++) {
        const e = Buffer.alloc(16);
        e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);  // width  (0 => 256)
        e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);  // height (0 => 256)
        e.writeUInt8(0, 2);              // palette
        e.writeUInt8(0, 3);              // reserved
        e.writeUInt16LE(1, 4);           // colour planes
        e.writeUInt16LE(32, 6);          // bits per pixel
        e.writeUInt32LE(pngs[i].length, 8);
        e.writeUInt32LE(offset, 12);
        offset += pngs[i].length;
        entries.push(e);
    }
    const ico = Buffer.concat([header, ...entries, ...pngs]);
    writeFileSync(join(here, 'icon.ico'), ico);
    writeFileSync(join(here, 'icon-256.png'), pngs[0]);
    console.log('assets/icon.ico  (256/128/64/48/32/16)');
}

async function buildAndroid() {
    const out = join(root, 'mobile', 'assets');
    mkdirSync(out, { recursive: true });

    // Legacy launcher icon: white tile with the glyph
    writeFileSync(join(out, 'icon.png'), await composed(1024, WHITE, BLACK, 0.72));
    // Adaptive icon layers: the foreground must sit inside the inner 66% safe zone
    writeFileSync(join(out, 'icon-foreground.png'), await composed(1024, { r: 0, g: 0, b: 0, alpha: 0 }, BLACK, 0.5));
    writeFileSync(join(out, 'icon-background.png'), await composed(1024, WHITE, WHITE, 0.01));
    // Splash screens (2732x2732 is the size @capacitor/assets expects)
    writeFileSync(join(out, 'splash.png'), await composed(2732, WHITE, BLACK, 0.18));
    writeFileSync(join(out, 'splash-dark.png'), await composed(2732, DARK, WHITE, 0.18));
    console.log('mobile/assets/{icon,icon-foreground,icon-background,splash,splash-dark}.png');
}

await buildIco();
await buildAndroid();
