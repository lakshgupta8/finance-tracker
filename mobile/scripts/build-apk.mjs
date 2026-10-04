// Builds the signed release APK with Gradle and copies it to mobile/release/.
//
// Two Windows-specific workarounds live here:
//  1. JDK selection: Gradle 8.14 / AGP 8.13 need JDK 17+, 21 preferred. We try
//     $JAVA_HOME, then Android Studio's bundled JBR, then C:\Program Files\Java.
//  2. Non-ASCII project paths: this repo sits in a OneDrive folder whose path
//     contains non-ASCII characters. gradlew.bat, java.exe argument decoding and
//     AGP all break on that, so the Android project (plus the Capacitor runtime
//     it references) is mirrored into an ASCII temp directory, built there, and
//     the APK is copied back.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');            // mobile/
const androidDir = join(root, 'android');
const isWin = process.platform === 'win32';

// ---------------------------------------------------------------- helpers
function copyDir(src, dest, skip = new Set()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
        if (skip.has(name)) continue;
        const s = join(src, name);
        const d = join(dest, name);
        if (statSync(s).isDirectory()) copyDir(s, d, skip);
        else copyFileSync(s, d);
    }
}

function javaMajor(home) {
    if (!home || !existsSync(join(home, 'bin'))) return 0;
    const r = spawnSync(join(home, 'bin', isWin ? 'java.exe' : 'java'), ['-version'], { encoding: 'utf8' });
    const m = /version "(\d+)/.exec(r.stderr || r.stdout || '');
    return m ? Number(m[1]) : 0;
}

function pickJavaHome() {
    const candidates = [process.env.JAVA_HOME];
    if (isWin) {
        candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');
        const pf = 'C:\\Program Files\\Java';
        if (existsSync(pf)) {
            for (const d of readdirSync(pf)) if (/^jdk-?(21|22|23|24)/.test(d)) candidates.push(join(pf, d));
        }
    }
    const scored = candidates.filter(Boolean).map((h) => ({ h, v: javaMajor(h) })).filter((c) => c.v >= 17);
    scored.sort((a, b) => Math.abs(a.v - 21) - Math.abs(b.v - 21)); // prefer 21
    return scored[0]?.h;
}

// ---------------------------------------------------------------- JDK
const javaHome = pickJavaHome();
if (!javaHome) {
    console.error('[build-apk] No JDK 17+ found. Install JDK 21 or Android Studio and retry.');
    process.exit(1);
}
console.log(`[build-apk] Using JAVA_HOME=${javaHome}`);

// ---------------------------------------------------------------- SDK path
// local.properties is git-ignored; create it from ANDROID_HOME when missing.
// Forward slashes on purpose: backslashes are escape characters in .properties files.
const localProps = join(androidDir, 'local.properties');
if (!existsSync(localProps)) {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
        || (isWin && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '');
    if (!sdk || !existsSync(sdk)) {
        console.error('[build-apk] Android SDK not found. Set ANDROID_HOME or create android/local.properties.');
        process.exit(1);
    }
    writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
    console.log(`[build-apk] Wrote android/local.properties (sdk.dir=${sdk})`);
}

// ---------------------------------------------------------------- staging
// eslint-disable-next-line no-control-regex
const needsStaging = /[^\x00-\x7F]/.test(root);
let buildRoot = root;
if (needsStaging) {
    buildRoot = join(tmpdir(), 'moneytabs-android-build');
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(buildRoot)) {
        console.error(`[build-apk] Temp dir ${buildRoot} is also non-ASCII; set TMP to an ASCII path.`);
        process.exit(1);
    }
    console.log(`[build-apk] Non-ASCII project path detected; staging build in ${buildRoot}`);
    rmSync(buildRoot, { recursive: true, force: true });
    copyDir(androidDir, join(buildRoot, 'android'), new Set(['.gradle', 'build', '.idea', '.kotlin']));
    copyDir(join(root, 'node_modules', '@capacitor', 'android'), join(buildRoot, 'node_modules', '@capacitor', 'android'));
    if (existsSync(join(root, 'keystore'))) copyDir(join(root, 'keystore'), join(buildRoot, 'keystore'));
}
const workDir = join(buildRoot, 'android');

// ---------------------------------------------------------------- gradle
// Run the wrapper jar with java directly (gradlew.bat mangles paths on some code pages).
const javaExe = join(javaHome, 'bin', isWin ? 'java.exe' : 'java');
const r = spawnSync(
    javaExe,
    ['-classpath', join('gradle', 'wrapper', 'gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', 'assembleRelease', '--no-daemon'],
    { cwd: workDir, stdio: 'inherit', env: { ...process.env, JAVA_HOME: javaHome } },
);
if (r.status !== 0) process.exit(r.status ?? 1);

// ---------------------------------------------------------------- collect
const outDir = join(workDir, 'app', 'build', 'outputs', 'apk', 'release');
const signedApk = join(outDir, 'app-release.apk');
const apk = existsSync(signedApk) ? signedApk : join(outDir, 'app-release-unsigned.apk');
if (apk !== signedApk) console.warn('[build-apk] No signing key found (android/keystore.properties); the APK is UNSIGNED and will not install until signed.');
if (!existsSync(apk)) {
    console.error(`[build-apk] Gradle finished but ${apk} is missing.`);
    process.exit(1);
}
mkdirSync(join(root, 'release'), { recursive: true });
copyFileSync(apk, join(root, 'release', 'MoneyTabs.apk'));
console.log(`[build-apk] Wrote mobile/release/MoneyTabs.apk (${(statSync(apk).size / 1024 / 1024).toFixed(1)} MB)`);
