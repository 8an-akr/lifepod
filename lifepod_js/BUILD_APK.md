# Building the LIFEpod Android APK

The app is a self-contained offline web app. These files wrap it with
[Capacitor](https://capacitorjs.com/) so it can be built into a real Android
APK whose web assets are **bundled inside the app** (no internet needed to play).

You don't need Android Studio or any Android tools on your PC — the APK is built
in the cloud by GitHub Actions.

## Get an APK (cloud build — recommended)

1. Commit and push these files to GitHub (branch `main`):
   - `lifepod_js/package.json`, `capacitor.config.json`, `scripts/`, `assets/`, `.gitignore`
   - `.github/workflows/build-apk.yml` (at the repo root)
2. On GitHub, open the **Actions** tab → **Build Android APK** → **Run workflow**
   (it also runs automatically whenever you push changes under `lifepod_js/`).
3. Wait for the green check (~3–5 min), open the run, and download the
   **`lifepod-debug-apk`** artifact. Inside is `app-debug.apk`.

## Get an APK on GitLab instead

The repo also ships a GitLab pipeline (`.gitlab-ci.yml` at the repo root) that
does the same build on GitLab's runners.

1. Put the project on GitLab — either import it (GitLab ▸ **New project ▸
   Import ▸ GitHub**) or add a remote and push:
   ```bash
   git remote add gitlab https://gitlab.com/<your-username>/lifepod.git
   git push gitlab main
   ```
2. In the GitLab project, go to **Build ▸ Pipelines** and click **Run pipeline**
   (it also runs on every push to the default branch).
3. When the `build_apk` job finishes (first run is slower — it downloads the
   Android SDK, then caches it), open the job and download
   **app-debug.apk** from the right-hand **Job artifacts** panel.

> The first build can take ~10–15 min and uses your GitLab CI minutes; later
> builds are faster thanks to the cached SDK and `node_modules`.

## Install it on your phone

1. Copy `app-debug.apk` to the phone (USB, Drive, email to yourself, etc.).
2. Tap it. Android will ask to allow installing from this source — enable
   **"Install unknown apps"** for the app you opened it with, then install.
3. Launch **LIFEpod**. It runs fully offline.

> This is a **debug** APK (signed with Android's debug key). That's perfect for
> personal/family use and sideloading. It is **not** for the Play Store — see
> below for a signed release.

## What the build does

`build-apk.yml` runs these steps on a GitHub runner:

| Step | Command |
|------|---------|
| Install JS deps | `npm install` |
| Copy web app into `www/` (as `index.html`) | `npm run prepare:www` |
| Create the native project | `npx cap add android` |
| Generate launcher icons from `assets/` | `npm run icons` |
| Bundle assets into the project | `npx cap sync android` |
| Compile the APK | `./gradlew assembleDebug` |

`www/` and `android/` are generated during the build and are git-ignored.

## Build locally instead (optional)

If you prefer to build on your own machine, install **Android Studio** (it
brings the JDK, Android SDK and Gradle), then:

```bash
cd lifepod_js
npm install
npm run prepare:www
npx cap add android
npm run icons          # optional: custom launcher icon
npx cap sync android
npx cap open android   # opens Android Studio → Build > Build APK(s)
```

## Making a signed release APK (for the Play Store, later)

A release build needs your own signing keystore:

```bash
keytool -genkey -v -keystore lifepod.keystore -alias lifepod \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then configure `android/app/build.gradle` with a `signingConfigs` block and run
`./gradlew assembleRelease` (or `bundleRelease` for an `.aab`). See the Capacitor
docs: <https://capacitorjs.com/docs/android/deploying-to-google-play>.

## Updating the app

Edit the normal files (`lifepod.html`, `lifepod.css`, `lifepod.js`, …) and push.
The workflow rebuilds the APK with your changes. Bump `version` in
`package.json` when you cut a new release.
