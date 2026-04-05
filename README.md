# Minimal Xray Client (Simplified)

## Structure

```text
/shared
  ?? config.js
  ?? xrayManager.js

/mobile
  ?? App.js
  ?? native/
  ?   ?? android/
  ?   ?? ios/

/desktop
  ?? main.js
  ?? renderer.js

/resources
  ?? xray/
```

## Where to put binaries

- Android: put `xray` in your real RN app assets (`android/app/src/main/assets/xray`)
- iOS: put `xray` in app bundle resources
- Windows: put `xray.exe` in `resources/xray/windows/xray.exe`

## Single manager

`shared/xrayManager.js` contains:

- `DesktopXrayProcessManager` for Electron main process
- `createDesktopRendererManager(ipcRenderer)` for Electron renderer
- `createMobileManager(NativeModules)` for React Native

## Run

### Mobile

```bash
cd mobile
npm install
npm run android
# or npm run ios
```

### Desktop

```bash
cd desktop
npm install
npm start
```
