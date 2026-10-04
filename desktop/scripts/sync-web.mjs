// Copies the shared web build (client/dist) and the app icon into this
// package so electron-builder can bundle them. Run `bun run build` inside
// client/ first (or use `npm run build:desktop` at the repo root which does both).
//
// Note: a hand-rolled recursive copy is used instead of fs.cpSync because
// cpSync aborts on OneDrive "Files On-Demand" placeholder entries.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const clientDist = join(root, '..', 'client', 'dist');
const icon = join(root, '..', 'assets', 'icon.ico');

function copyDir(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
        const s = join(src, name);
        const d = join(dest, name);
        if (statSync(s).isDirectory()) copyDir(s, d);
        else copyFileSync(s, d);
    }
}

if (!existsSync(join(clientDist, 'index.html'))) {
    console.error(`\n[sync-web] No web build found at ${clientDist}\n           Run "bun run build" inside client/ first.\n`);
    process.exit(1);
}
if (!existsSync(icon)) {
    console.error(`\n[sync-web] Missing ${icon}. Run "node assets/generate-icons.mjs" at the repo root.\n`);
    process.exit(1);
}

rmSync(join(root, 'dist'), { recursive: true, force: true });
copyDir(clientDist, join(root, 'dist'));
mkdirSync(join(root, 'build'), { recursive: true });
copyFileSync(icon, join(root, 'build', 'icon.ico'));
console.log('[sync-web] Copied client/dist -> desktop/dist and assets/icon.ico -> desktop/build/icon.ico');
