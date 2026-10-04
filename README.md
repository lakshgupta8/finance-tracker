<div align="center">

# Money Tabs

**Track, merge, and organize your wealth - on your phone and your PC, from one shared database.**

  <p align="center">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white" alt="Capacitor" />
    <img src="https://img.shields.io/badge/Turso-4FF8D2?style=for-the-badge&logo=sqlite&logoColor=black" alt="Turso" />
  </p>

> One React code-base packaged twice: a **Windows desktop app** (Electron) and an **Android APK** (Capacitor).
> Both talk directly to a single free, hosted **Turso** (libSQL / SQLite-compatible) database, so every
> balance, ledger entry and even the tab grouping layout stays in sync across devices.

</div>

<br />

---

## How it fits together

```
finance-tracker/
├── client/    React + Vite + Tailwind app (shared UI, talks SQL to Turso over HTTPS)
├── desktop/   Electron shell  -> Windows installer + portable exe
├── mobile/    Capacitor shell -> Android APK
├── assets/    Icon generator (Windows .ico + Android launcher/splash from the card glyph)
└── seed/      One-shot script that uploads data from the old SQLite file into the cloud database
```

There is no server to run any more. The former Flask REST API (`server/`) and the
`start_tracker.bat` launcher were removed; their logic now lives in
[client/src/lib/db.ts](client/src/lib/db.ts), where every old endpoint is a function that runs
its SQL as a single transactional batch against the hosted database.

| Feature | Description |
| :--- | :--- |
| **Shared cloud database** | Turso free tier (100 databases, 5 GB, no sleeping). Single user, so one auth token is entered once per device. |
| **Drag & Drop Merging** | Group tabs into combined totals (desktop, with a mouse). The grouping is saved in the database, so the phone shows the same arrangement. |
| **Audit History Ledger** | Every Quick Add / Spend leaves a timestamped trace; deleting a trace reverses it atomically. |
| **Real-time Analytics** | Recharts bar chart of every tab's balance. |
| **Auto refresh** | Data reloads whenever the app returns to the foreground. |

---

## 1. Create the free database (one time)

1. Sign up at **https://turso.tech** (GitHub login works) and create a database, e.g. `money-tabs`.
2. Copy the database URL. It looks like `libsql://money-tabs-<yourname>.turso.io`.
3. Create an auth token: on the database page choose **Generate token** (no expiry is fine for a
   personal app), or with the CLI run `turso db tokens create money-tabs`.

Keep both values somewhere safe; you will paste them into each app once.

## 2. Seed existing data (optional)

If you used the previous Flask version, its data lives in `server/instance/data.db`. Copy that
file to `seed/data.db` (any `*.db` in `seed/` is git-ignored, so it never gets committed) and run:

```bash
python seed/seed.py --url libsql://money-tabs-<yourname>.turso.io --token <TOKEN>
```

Use `--db <path>` to read the SQLite file from somewhere else instead. The script creates the
tables, copies every account and transaction with the original ids, and prints the row counts and
combined balance so you can compare. It refuses to write into a database that already has data
unless you pass `--wipe`. No extra Python packages are needed.

Starting fresh? Skip this step; the apps create the tables on first connect.

## 3. Build and install the apps

Binaries are not committed. Build them (see [Building from source](#building-from-source)) and
they appear here:

| Platform | File | Notes |
| :--- | :--- | :--- |
| Windows installer | `desktop/release/MoneyTabs-1.0.0-win-x64.exe` | Adds a Start-menu / desktop shortcut |
| Windows portable | `desktop/release/MoneyTabs-Portable.exe` | Single exe, no install |
| Android | `mobile/release/MoneyTabs.apk` | Copy to the phone and open it (allow "install unknown apps"), or `adb install -r mobile/release/MoneyTabs.apk` |

Windows SmartScreen will warn once because the exe is unsigned; choose **More info -> Run anyway**.

On first launch each app shows a **Connect Your Database** screen: paste the URL and token from
step 1. The credentials stay on that device (localStorage) and can be changed later through the
database button in the header.

> Optional: copy [client/.env.example](client/.env.example) to `client/.env`, fill in the two values
> and rebuild. The apps then start already connected and the screen never appears. `.env` is
> git-ignored; never commit it.

---

## Building from source

Prerequisites: Node 20+, Bun, Python 3, a JDK 17 or 21 (Android Studio's bundled JBR is picked
automatically) and the Android SDK (`ANDROID_HOME`, or a `mobile/android/local.properties`).

```bash
# shared web bundle (also runs type-checking)
cd client && bun install && bun run build

# Windows: installer + portable exe -> desktop/release/
cd desktop && npm install && npm run build

# Android: release APK -> mobile/release/MoneyTabs.apk
cd mobile && npm install && npm run build

# or, from the repo root, everything at once
npm run build
```

Other useful commands:

| Command | Where | What |
| :--- | :--- | :--- |
| `bun run dev` | client/ | Hot-reloading web preview in the browser |
| `npm start` | desktop/ | Launch the Electron app without packaging |
| `npm run open` | mobile/ | Open the Android project in Android Studio |
| `npm run install-apk` | mobile/ | Install the built APK on a USB-connected phone |
| `node assets/generate-icons.mjs` | root | Regenerate `.ico` and Android icons from `client/public/favicon.svg` |
| `npm run icons` | mobile/ | Re-run `@capacitor/assets` after regenerating the source PNGs |

### Android signing key

The signing key is **not in the repository**. Without one, `npm run build` in `mobile/` produces an
unsigned APK that Android will refuse to install. To sign:

1. Create a key once:
   ```bash
   cd mobile
   mkdir keystore
   keytool -genkeypair -v -keystore keystore/moneytabs.jks -alias moneytabs -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy [mobile/android/keystore.properties.example](mobile/android/keystore.properties.example)
   to `mobile/android/keystore.properties` and fill in the passwords you chose.

Both `mobile/keystore/` and `keystore.properties` are git-ignored. Back them up somewhere private:
Android only lets you update an installed app with the **same** key, so losing it means
uninstalling the old APK before installing a new build.

### App icon

Both apps use the credit-card glyph from the original web app's favicon / `icon.ico`.
Windows keeps the original look (black outline, transparent background). Android adaptive icons
require an opaque background layer, so the launcher icon is the same glyph on a white tile.

---

## Notes and limitations

- **Internet required.** There is no offline cache; the apps read and write the cloud database live.
- **Drag-and-drop is mouse-only.** HTML5 drag events do not fire from touch, so arrange groups on
  the desktop; the phone will show the same grouping.
- **Security model.** The Turso token grants full access to the database. It is stored in plain
  localStorage on each device, which is fine for a single-user personal app. Do not share the
  token, a `client/.env` containing it, or an app built with it baked in.
- **The desktop app runs Chromium without its OS sandbox** (`--no-sandbox` in `desktop/main.cjs`).
  On some Windows PCs the sandboxed GPU/renderer processes fail to start when the app lives under
  `%LOCALAPPDATA%` (where the installer and the portable exe put it), and Electron aborts with
  "GPU process isn't usable" before showing a window. The renderer only runs the bundled code with
  context isolation on and node integration off, so this is an acceptable trade-off.
- **Non-ASCII or OneDrive-synced checkout paths** (for example a localised OneDrive "Documents"
  folder) break Gradle and electron-builder on Windows. The build scripts work around this by
  building in `%TEMP%` (`moneytabs-android-build` and `moneytabs-desktop-build`) and copying the
  outputs back, and they copy files manually because Node's `fs.cpSync` fails on OneDrive
  placeholders. Opening `mobile/android` directly in Android Studio from such a path will fail;
  use `npm run build` in `mobile/`, or clone to a plain ASCII path such as `C:\dev\finance-tracker`.

## License

MIT - see [LICENSE.md](LICENSE.md).
