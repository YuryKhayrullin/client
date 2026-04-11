import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import proxyCore from "../native/proxyCore";
import { DEFAULT_CONFIG_TEXT, DEFAULT_PROFILE } from "../config/defaultConfig";
import {
  configTextToProfile,
  importProxyLink,
  normalizeJsonConfig,
  profileToConfigText,
  sanitizeProfile,
  extractProxyLinksFromText,
  extractPrimaryEndpointFromConfig
} from "../config/configCodec";

const STORAGE_KEYS = {
  profile: "android_proxy_profile_v2",
  config: "android_proxy_config_v2",
  mode: "android_proxy_mode_v2",
  importLink: "android_proxy_import_link_v1"
};

const SUBSCRIPTION_FETCH_TIMEOUT_MS = 12000;
const SERVER_PROBE_TIMEOUT_MS = 4500;
const MAX_SUBSCRIPTION_CHARS = 2 * 1024 * 1024;

async function persistState(profile, configText, mode, importLinkText) {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.profile, JSON.stringify(profile)],
    [STORAGE_KEYS.config, configText],
    [STORAGE_KEYS.mode, mode],
    [STORAGE_KEYS.importLink, importLinkText]
  ]);
}

function firstLinkFromText(text) {
  const links = extractProxyLinksFromText(text);
  if (!links.length) {
    throw new Error("No vless:// or vmess:// link found.");
  }
  return links[0];
}

function splitList(value) {
  return String(value || "")
    .split(/[\n,;]/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeProfileOrDefault(input) {
  try {
    return sanitizeProfile(input || DEFAULT_PROFILE);
  } catch (_error) {
    return sanitizeProfile(DEFAULT_PROFILE);
  }
}

function hostMatchesAllowToken(hostname, token) {
  if (!hostname || !token) return false;
  if (hostname === token) return true;
  if (token.startsWith("*.")) {
    const bare = token.slice(2);
    return hostname === bare || hostname.endsWith(`.${bare}`);
  }
  return hostname.endsWith(`.${token}`);
}

function assertHttpHostAllowed(urlObject, allowHostsRaw) {
  if (urlObject.protocol !== "http:") {
    return;
  }

  const host = String(urlObject.hostname || "").trim().toLowerCase();
  const allowHosts = splitList(allowHostsRaw);
  const allowed = allowHosts.some((token) => hostMatchesAllowToken(host, token));

  if (!allowed) {
    const listText = allowHosts.length ? allowHosts.join(", ") : "(empty)";
    throw new Error(
      `HTTP URL is blocked for host '${host}'. Allowed hosts: ${listText}. Use HTTPS or update allowlist.`
    );
  }
}

function formatFetchError(error) {
  if (!error) return "Unknown network error.";

  if (error.name === "AbortError") {
    return `Subscription request timeout (${SUBSCRIPTION_FETCH_TIMEOUT_MS}ms).`;
  }

  const text = String(error.message || error);
  if (/network request failed/i.test(text)) {
    return "Network request failed. Check internet, DNS, SSL, and domain availability.";
  }

  return text;
}

async function fetchSubscriptionText(urlText, allowHostsRaw) {
  let urlObject;
  try {
    urlObject = new URL(String(urlText || "").trim());
  } catch (_error) {
    throw new Error("Subscription URL is invalid.");
  }

  if (urlObject.protocol !== "https:" && urlObject.protocol !== "http:") {
    throw new Error("Subscription URL must start with https:// or allowed http:// host.");
  }

  assertHttpHostAllowed(urlObject, allowHostsRaw);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBSCRIPTION_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(urlObject.toString(), {
      method: "GET",
      headers: { Accept: "text/plain,*/*" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Subscription URL failed (${response.status} ${response.statusText || ""}).`);
    }

    const payload = await response.text();
    if (!payload || !payload.trim()) {
      throw new Error("Subscription payload is empty.");
    }

    if (payload.length > MAX_SUBSCRIPTION_CHARS) {
      throw new Error("Subscription payload is too large.");
    }

    return payload;
  } catch (error) {
    throw new Error(formatFetchError(error));
  } finally {
    clearTimeout(timeout);
  }
}

function formatEndpointLabel(endpoint) {
  if (!endpoint) return "";
  return `${endpoint.host}:${endpoint.port}`;
}

export function useProxyController() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [configText, setConfigText] = useState(DEFAULT_CONFIG_TEXT);
  const [mode, setMode] = useState("simple");
  const [importLinkText, setImportLinkText] = useState("");

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Disconnected");
  const [statusDetails, setStatusDetails] = useState({
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
  });

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        const entries = await AsyncStorage.multiGet([
          STORAGE_KEYS.profile,
          STORAGE_KEYS.config,
          STORAGE_KEYS.mode,
          STORAGE_KEYS.importLink
        ]);

        const map = Object.fromEntries(entries);
        const storedConfig = map[STORAGE_KEYS.config] || (await proxyCore.loadConfig()) || DEFAULT_CONFIG_TEXT;
        const normalized = normalizeJsonConfig(storedConfig);
        const storedMode = map[STORAGE_KEYS.mode] || "simple";
        const parsedProfile = map[STORAGE_KEYS.profile] ? JSON.parse(map[STORAGE_KEYS.profile]) : null;
        const detectedProfile = configTextToProfile(normalized);
        const nextProfile = normalizeProfileOrDefault(parsedProfile || detectedProfile || DEFAULT_PROFILE);
        const status = await proxyCore.getStatus();

        if (!active) return;

        setConfigText(normalized);
        setMode(storedMode === "advanced" ? "advanced" : "simple");
        setImportLinkText(map[STORAGE_KEYS.importLink] || "");
        setProfile(nextProfile);
        setRunning(Boolean(status.running));
        setStatusDetails(status);

        if (status.running) {
          setMessage("Tunnel is running");
        } else if (status.lastError) {
          setMessage(`Stopped: ${status.lastError}`);
        } else {
          setMessage("Disconnected");
        }

        await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(nextProfile));
      } catch (error) {
        if (!active) return;
        setRunning(false);
        setMessage(`Bootstrap failed: ${error.message}`);
      }
    }

    loadInitial();
    return () => {
      active = false;
    };
  }, []);

  function updateSimpleField(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  async function importLinkFromKey(linkValue, sourceLabel = "link") {
    const imported = importProxyLink(linkValue);
    const normalized = normalizeJsonConfig(imported.configText);

    setProfile(imported.profile);
    setConfigText(normalized);
    setMode("simple");

    await Promise.all([
      proxyCore.saveConfig(normalized),
      persistState(imported.profile, normalized, "simple", linkValue)
    ]);

    setImportLinkText(linkValue);
    setMessage(`Imported from ${sourceLabel}: ${imported.profile.name}`);
    return normalized;
  }

  async function importFromAnyText(rawText, sourceLabel = "input") {
    const text = String(rawText || "").trim();
    if (!text) {
      throw new Error("Input is empty.");
    }

    if (/^https?:\/\//i.test(text)) {
      const payload = await fetchSubscriptionText(text, profile.allowHttpSubscriptionHosts);
      const firstLink = firstLinkFromText(payload);
      return importLinkFromKey(firstLink, sourceLabel);
    }

    const firstLink = firstLinkFromText(text);
    return importLinkFromKey(firstLink, sourceLabel);
  }

  async function importLink() {
    try {
      return await importFromAnyText(importLinkText, "manual");
    } catch (error) {
      setMessage(`Import failed: ${error.message}`);
      throw error;
    }
  }

  async function importFromClipboard(textFromClipboard) {
    try {
      return await importFromAnyText(textFromClipboard, "clipboard");
    } catch (error) {
      setMessage(`Clipboard import failed: ${error.message}`);
      throw error;
    }
  }

  async function importFromQr(textFromQr) {
    try {
      return await importFromAnyText(textFromQr, "qr");
    } catch (error) {
      setMessage(`QR import failed: ${error.message}`);
      throw error;
    }
  }

  async function saveSimple() {
    try {
      const validatedProfile = sanitizeProfile(profile);
      const nextConfigText = profileToConfigText(validatedProfile);
      const normalized = normalizeJsonConfig(nextConfigText);

      setProfile(validatedProfile);
      setConfigText(normalized);

      await Promise.all([
        persistState(validatedProfile, normalized, mode, importLinkText),
        proxyCore.saveConfig(normalized)
      ]);

      setMessage("Profile saved");
      return normalized;
    } catch (error) {
      setMessage(`Save failed: ${error.message}`);
      throw error;
    }
  }

  async function saveAdvanced() {
    try {
      const normalized = normalizeJsonConfig(configText);
      const detectedProfile = configTextToProfile(normalized);

      setConfigText(normalized);
      if (detectedProfile) {
        setProfile(detectedProfile);
      }

      await Promise.all([
        persistState(detectedProfile || profile, normalized, mode, importLinkText),
        proxyCore.saveConfig(normalized)
      ]);

      setMessage("Config saved");
      return normalized;
    } catch (error) {
      setMessage(`Config error: ${error.message}`);
      throw error;
    }
  }

  async function save() {
    return mode === "advanced" ? saveAdvanced() : saveSimple();
  }

  async function refreshStatus() {
    try {
      const status = await proxyCore.getStatus();
      setRunning(Boolean(status.running));
      setStatusDetails(status);

      if (status.running) {
        if (status.lastProbeError) {
          setMessage(`Running, but last probe failed: ${status.lastProbeError}`);
        } else {
          setMessage("Tunnel is running");
        }
      } else if (status.lastError) {
        setMessage(`Stopped: ${status.lastError}`);
      } else if (typeof status.processExitCode === "number") {
        setMessage(`Core exited with code ${status.processExitCode}`);
      } else {
        setMessage("Disconnected");
      }
    } catch (error) {
      setMessage(`Status read failed: ${error.message}`);
    }
  }

  async function runServerPreflight(configToUse) {
    const endpoint = extractPrimaryEndpointFromConfig(configToUse);
    setMessage(`Checking server ${formatEndpointLabel(endpoint)}...`);
    await proxyCore.checkServerReachable(endpoint.host, endpoint.port, SERVER_PROBE_TIMEOUT_MS);
    return endpoint;
  }

  async function toggleConnection() {
    if (busy) return;

    setBusy(true);
    try {
      if (running) {
        await proxyCore.stop();
        setRunning(false);
        setMessage("Disconnected");
      } else {
        const normalized = await save();
        const endpoint = await runServerPreflight(normalized);

        await proxyCore.start(normalized);

        const statusAfterStart = await proxyCore.getStatus();
        setRunning(Boolean(statusAfterStart.running));
        setStatusDetails(statusAfterStart);

        if (!statusAfterStart.running) {
          const stopReason = statusAfterStart.lastError || "Core stopped right after start.";
          throw new Error(stopReason);
        }

        setMessage(`Connected. SOCKS5 127.0.0.1:10808 via ${formatEndpointLabel(endpoint)}`);
      }

      await refreshStatus();
    } catch (error) {
      setRunning(false);
      setMessage(`Action failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function switchMode(nextMode) {
    const normalizedMode = nextMode === "advanced" ? "advanced" : "simple";
    setMode(normalizedMode);

    await AsyncStorage.setItem(STORAGE_KEYS.mode, normalizedMode);

    if (normalizedMode === "simple") {
      const detected = configTextToProfile(configText);
      if (detected) {
        setProfile(detected);
        await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(detected));
      }
    }
  }

  const connectedSinceText = useMemo(() => {
    if (!statusDetails.startedAtMs) return "";
    return new Date(statusDetails.startedAtMs).toLocaleString();
  }, [statusDetails.startedAtMs]);

  return {
    profile,
    configText,
    mode,
    running,
    busy,
    message,
    statusDetails,
    connectedSinceText,
    importLinkText,
    setConfigText,
    setImportLinkText,
    updateSimpleField,
    importLink,
    importFromClipboard,
    importFromQr,
    save,
    switchMode,
    refreshStatus,
    toggleConnection
  };
}
