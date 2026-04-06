# Android Proxy Client

Android-only React Native client with embedded Xray-core.

## What is included

- Android mobile app in `mobile/`
- Xray binary preparation script for Android APK builds
- Simple mode with manual profile fields
- Quick import for `vless://` and `vmess://` links
- Advanced JSON editor for direct Xray config editing

## Build APK

```bash
cd mobile
npm install
npm run apk:debug
```

Debug APK output:

- `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## Prepare Android core binaries

```bash
cd mobile
npm run android:prepare-xray
```

Assets created:

- `mobile/android/app/src/main/assets/xray-arm64-v8a`
- `mobile/android/app/src/main/assets/xray-amd64`

## Run in development

```bash
cd mobile
npm run android
```
