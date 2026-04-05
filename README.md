# Minimal Xray Client

Cross-platform personal-use scaffold:

- Mobile: React Native (Android/iOS)
- Desktop: Electron
- Networking engine: Xray-core as external process

## Project Structure

```text
/shared
  config.js
  xrayManager.js

/mobile
  App.js
  android/
  native/
    android/
    ios/
  scripts/

/desktop
  main.js
  renderer.js

/resources
  xray/
    windows/
    linux/
```

## Download Ready APK (Recommended)

A GitHub Actions workflow builds APK automatically.

1. Push changes to `main` (or run workflow manually in Actions tab).
2. Open GitHub repo -> `Actions` -> `Build Android APK`.
3. Open latest successful run.
4. Download artifact: `client-mobile-debug-apk`.
5. Inside artifact, install `app-debug.apk` on Android.

Workflow file:

- `.github/workflows/build-android-apk.yml`

## Local APK Build

```bash
cd mobile
npm install
npm run apk:debug
```

APK output:

- `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## Android Xray Binary Assets

Before build, script downloads official Android binaries into assets:

```bash
cd mobile
npm run android:prepare-xray
```

Assets created:

- `mobile/android/app/src/main/assets/xray-arm64-v8a`
- `mobile/android/app/src/main/assets/xray-amd64`

## Run App (Debug)

```bash
cd mobile
npm run android
```

## Desktop Run

```bash
cd desktop
npm install
npm start
```
