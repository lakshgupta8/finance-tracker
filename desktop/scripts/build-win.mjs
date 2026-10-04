// Packages the Windows installer + portable exe.
// electron-builder writes into an ASCII temp directory outside OneDrive
// (OneDrive locks freshly created folders and made electron-builder's
// win-unpacked.tmp -> win-unpacked rename fail with EPERM), then the two
// executables are copied back to desktop/release/.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');                      // desktop/
const isWin = process.platform === 'win32';
const out = join(tmpdir(), 'moneytabs-desktop-build');
const release = join(root, 'release');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const builder = join(root, 'node_modules', '.bin', isWin ? 'electron-builder.cmd' : 'electron-builder');
const r = spawnSync(isWin ? `"${builder}"` : builder, ['--win', `-c.directories.output=${out}`], {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
});
if (r.status !== 0) process.exit(r.status ?? 1);

mkdirSync(release, { recursive: true });
const copied = [];
for (const name of readdirSync(out)) {
    if (/\.(exe|blockmap|yml)$/i.test(name)) {
        copyFileSync(join(out, name), join(release, name));
        copied.push(name);
    }
}
if (!copied.some((n) => n.endsWith('.exe'))) {
    console.error(`[build-win] electron-builder finished but no .exe found in ${out}`);
    process.exit(1);
}
console.log(`[build-win] Copied to desktop/release: ${copied.join(', ')}`);
console.log(`[build-win] Unpacked app for local testing: ${join(out, 'win-unpacked')}`);
if (!existsSync(join(out, 'win-unpacked', 'Money Tabs.exe'))) console.warn('[build-win] (win-unpacked not found)');
