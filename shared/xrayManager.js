const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { DEFAULT_CONFIG_TEXT } = require("./config");

class DesktopXrayProcessManager {
  constructor(electronApp) {
    this.electronApp = electronApp;
    this.xrayProcess = null;
    this.running = false;

    this.baseDir = path.join(this.electronApp.getPath("userData"), "xray-client");
    this.binDir = path.join(this.baseDir, "bin");
    this.configPath = path.join(this.baseDir, "config.json");
    this.logPath = path.join(this.baseDir, "xray.log");

    this.ensureBaseDirs();
  }

  ensureBaseDirs() {
    fs.mkdirSync(this.binDir, { recursive: true });
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, DEFAULT_CONFIG_TEXT, "utf8");
    }
  }

  resolveBinarySpec() {
    if (process.platform === "win32") {
      return { subdir: "windows", fileName: "xray.exe" };
    }

    if (process.platform === "linux") {
      return { subdir: "linux", fileName: "xray" };
    }

    if (process.platform === "darwin") {
      return { subdir: "macos", fileName: "xray" };
    }

    throw new Error("Unsupported platform for desktop xray: " + process.platform);
  }

  getSourceBinaryPath() {
    const spec = this.resolveBinarySpec();

    if (this.electronApp.isPackaged) {
      return path.join(process.resourcesPath, "xray", spec.subdir, spec.fileName);
    }

    return path.join(process.cwd(), "resources", "xray", spec.subdir, spec.fileName);
  }

  getTargetBinaryPath() {
    return path.join(this.binDir, process.platform === "win32" ? "xray.exe" : "xray");
  }

  ensureBinaryReady() {
    const source = this.getSourceBinaryPath();
    const target = this.getTargetBinaryPath();

    if (!fs.existsSync(source)) {
      throw new Error("xray binary not found at: " + source);
    }

    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o755);
    }

    return target;
  }

  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, DEFAULT_CONFIG_TEXT, "utf8");
    }
    return fs.readFileSync(this.configPath, "utf8");
  }

  saveConfig(configText) {
    fs.writeFileSync(this.configPath, configText, "utf8");
  }

  appendLog(line) {
    fs.appendFileSync(this.logPath, new Date().toISOString() + " " + line + "\n", "utf8");
  }

  start(configText) {
    if (this.running && this.xrayProcess) {
      return this.getStatus();
    }

    this.saveConfig(configText);
    const binary = this.ensureBinaryReady();

    this.xrayProcess = spawn(binary, ["run", "-c", this.configPath], {
      cwd: this.baseDir,
      windowsHide: true
    });

    this.running = true;
    this.appendLog("xray started");

    this.xrayProcess.stdout.on("data", (chunk) => this.appendLog(chunk.toString().trim()));
    this.xrayProcess.stderr.on("data", (chunk) => this.appendLog(chunk.toString().trim()));
    this.xrayProcess.on("exit", (code) => {
      this.running = false;
      this.xrayProcess = null;
      this.appendLog("xray exited with code " + code);
    });

    return this.getStatus();
  }

  stop() {
    if (this.xrayProcess) {
      this.xrayProcess.kill();
      this.xrayProcess = null;
    }

    this.running = false;
    this.appendLog("xray stopped");
    return this.getStatus();
  }

  getStatus() {
    return {
      running: this.running,
      pid: this.xrayProcess ? this.xrayProcess.pid : null,
      socks: "127.0.0.1:10808",
      configPath: this.configPath,
      logPath: this.logPath
    };
  }
}

function createDesktopRendererManager(ipcRenderer) {
  return {
    loadConfig: () => ipcRenderer.invoke("xray:loadConfig"),
    saveConfig: (configText) => ipcRenderer.invoke("xray:saveConfig", configText),
    start: (configText) => ipcRenderer.invoke("xray:start", configText),
    stop: () => ipcRenderer.invoke("xray:stop"),
    getStatus: () => ipcRenderer.invoke("xray:status")
  };
}

function createMobileManager(nativeModules) {
  const moduleRef = nativeModules && nativeModules.XrayModule;

  if (!moduleRef) {
    throw new Error("XrayModule native bridge is not registered.");
  }

  return {
    loadConfig: async () => DEFAULT_CONFIG_TEXT,
    saveConfig: async () => true,
    start: (configText) => moduleRef.start(configText),
    stop: () => moduleRef.stop(),
    getStatus: () => moduleRef.getStatus()
  };
}

module.exports = {
  DesktopXrayProcessManager,
  createDesktopRendererManager,
  createMobileManager
};
