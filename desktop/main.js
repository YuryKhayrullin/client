const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { DesktopXrayProcessManager } = require("../shared/xrayManager");

let mainWindow;
let xrayManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 760,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function registerIpcHandlers() {
  ipcMain.handle("xray:loadConfig", () => xrayManager.loadConfig());
  ipcMain.handle("xray:saveConfig", (_event, configText) => xrayManager.saveConfig(configText));
  ipcMain.handle("xray:start", (_event, configText) => xrayManager.start(configText));
  ipcMain.handle("xray:stop", () => xrayManager.stop());
  ipcMain.handle("xray:status", () => xrayManager.getStatus());
}

app.whenReady().then(() => {
  xrayManager = new DesktopXrayProcessManager(app);
  registerIpcHandlers();
  createWindow();
});

app.on("before-quit", () => {
  if (xrayManager) xrayManager.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
