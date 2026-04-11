import { NativeModules } from "react-native";

const FALLBACK_STATUS = {
  running: false,
  socks: "127.0.0.1:10808",
  logPath: "",
  configPath: "",
  startedAtMs: 0,
  lastError: "",
  processExitCode: null,
  lastProbeTarget: "",
  lastProbeAtMs: 0,
  lastProbeLatencyMs: 0,
  lastProbeOk: false,
  lastProbeError: ""
};

function createMissingBridge() {
  const error = new Error("Native XrayModule is not registered. Rebuild Android app.");
  return {
    start: async () => {
      throw error;
    },
    stop: async () => FALLBACK_STATUS,
    restart: async () => {
      throw error;
    },
    getStatus: async () => FALLBACK_STATUS,
    loadConfig: async () => "",
    saveConfig: async () => {
      throw error;
    },
    checkServerReachable: async () => {
      throw error;
    }
  };
}

const bridge = NativeModules?.XrayModule || createMissingBridge();

async function start(configText) {
  return bridge.start(configText);
}

async function stop() {
  return bridge.stop();
}

async function restart(configText) {
  if (typeof bridge.restart === "function") {
    return bridge.restart(configText);
  }

  await bridge.stop();
  return bridge.start(configText);
}

async function getStatus() {
  const status = await bridge.getStatus();
  return { ...FALLBACK_STATUS, ...(status || {}) };
}

async function loadConfig() {
  if (typeof bridge.loadConfig !== "function") return "";
  return bridge.loadConfig();
}

async function saveConfig(configText) {
  if (typeof bridge.saveConfig !== "function") return false;
  return bridge.saveConfig(configText);
}

async function checkServerReachable(host, port, timeoutMs = 4500) {
  if (typeof bridge.checkServerReachable !== "function") {
    throw new Error("Native server probe is not available. Rebuild Android app.");
  }

  return bridge.checkServerReachable(String(host || ""), Number(port), Number(timeoutMs));
}

export default {
  start,
  stop,
  restart,
  getStatus,
  loadConfig,
  saveConfig,
  checkServerReachable
};
