const { Buffer } = require("buffer");
const { DEFAULT_PROFILE, buildVlessConfig } = require("./defaultConfig");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeJsonConfig(input) {
  const parsed = JSON.parse(String(input));

  if (!Array.isArray(parsed.outbounds) || parsed.outbounds.length === 0) {
    throw new Error("Config must include at least one outbound.");
  }

  if (!Array.isArray(parsed.inbounds) || parsed.inbounds.length === 0) {
    parsed.inbounds = buildVlessConfig(DEFAULT_PROFILE).inbounds;
  }

  return JSON.stringify(parsed, null, 2);
}

function sanitizeProfile(raw) {
  const merged = {
    ...DEFAULT_PROFILE,
    ...raw,
    server: String(raw?.server || DEFAULT_PROFILE.server).trim(),
    sni: String(raw?.sni || raw?.host || raw?.server || DEFAULT_PROFILE.sni).trim(),
    uuid: String(raw?.uuid || DEFAULT_PROFILE.uuid).trim(),
    security: String(raw?.security || DEFAULT_PROFILE.security).trim().toLowerCase(),
    alpn: String(raw?.alpn || DEFAULT_PROFILE.alpn).trim()
  };

  const parsedPort = Number(merged.port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error("Port must be an integer from 1 to 65535.");
  }

  if (!merged.server) {
    throw new Error("Server is required.");
  }

  if (!UUID_PATTERN.test(merged.uuid)) {
    throw new Error("UUID format is invalid.");
  }

  if (merged.security !== "tls" && merged.security !== "none") {
    throw new Error("Security must be tls or none.");
  }

  return {
    ...merged,
    port: parsedPort,
    sni: merged.security === "tls" ? merged.sni || merged.server : ""
  };
}

function profileToConfigText(profile) {
  const safe = sanitizeProfile(profile);
  return JSON.stringify(buildVlessConfig(safe), null, 2);
}

function configTextToProfile(configText) {
  try {
    const parsed = JSON.parse(String(configText));
    const firstOutbound = Array.isArray(parsed.outbounds) ? parsed.outbounds[0] : null;

    if (!firstOutbound) {
      return null;
    }

    if (firstOutbound.protocol === "vless") {
      const firstNode = firstOutbound.settings?.vnext?.[0];
      const firstUser = firstNode?.users?.[0];
      if (!firstNode || !firstUser) {
        return null;
      }

      const security = firstOutbound.streamSettings?.security || "none";

      return sanitizeProfile({
        name: "Imported",
        server: firstNode.address,
        port: firstNode.port,
        uuid: firstUser.id,
        sni: firstOutbound.streamSettings?.tlsSettings?.serverName || firstNode.address,
        security,
        alpn: Array.isArray(firstOutbound.streamSettings?.tlsSettings?.alpn)
          ? firstOutbound.streamSettings.tlsSettings.alpn.join(",")
          : DEFAULT_PROFILE.alpn
      });
    }

    if (firstOutbound.protocol === "vmess") {
      const firstNode = firstOutbound.settings?.vnext?.[0];
      const firstUser = firstNode?.users?.[0];
      if (!firstNode || !firstUser) {
        return null;
      }

      const security = firstOutbound.streamSettings?.security || "none";

      return sanitizeProfile({
        name: "Imported VMess",
        server: firstNode.address,
        port: firstNode.port,
        uuid: firstUser.id,
        sni:
          firstOutbound.streamSettings?.tlsSettings?.serverName ||
          firstOutbound.streamSettings?.wsSettings?.headers?.Host ||
          firstNode.address,
        security,
        alpn: Array.isArray(firstOutbound.streamSettings?.tlsSettings?.alpn)
          ? firstOutbound.streamSettings.tlsSettings.alpn.join(",")
          : DEFAULT_PROFILE.alpn
      });
    }

    return null;
  } catch (_error) {
    return null;
  }
}

function decodeBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function parseVlessUrl(input) {
  const url = new URL(String(input).trim());
  const profileName = decodeURIComponent(url.hash?.replace(/^#/, "") || "Imported VLESS");
  const security = (url.searchParams.get("security") || "tls").toLowerCase();
  const sni = url.searchParams.get("sni") || url.searchParams.get("host") || url.hostname;
  const alpn = url.searchParams.get("alpn") || DEFAULT_PROFILE.alpn;

  return sanitizeProfile({
    name: profileName,
    server: url.hostname,
    port: Number(url.port || 443),
    uuid: decodeURIComponent(url.username),
    sni,
    security: security === "reality" ? "tls" : security,
    alpn
  });
}

function parseVmessUrl(input) {
  const raw = String(input).trim();
  const payload = raw.replace(/^vmess:\/\//i, "");
  const decoded = decodeBase64Url(payload);
  const parsed = JSON.parse(decoded);

  return sanitizeProfile({
    name: parsed.ps || "Imported VMess",
    server: parsed.add,
    port: Number(parsed.port || 443),
    uuid: parsed.id,
    sni: parsed.sni || parsed.host || parsed.add,
    security: parsed.tls === "tls" || parsed.scy === "tls" ? "tls" : (parsed.security || parsed.tls || "none"),
    alpn: parsed.alpn || DEFAULT_PROFILE.alpn
  });
}

function importProxyLink(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Paste a vless:// or vmess:// link.");
  }

  let profile;
  if (/^vless:\/\//i.test(trimmed)) {
    profile = parseVlessUrl(trimmed);
  } else if (/^vmess:\/\//i.test(trimmed)) {
    profile = parseVmessUrl(trimmed);
  } else {
    throw new Error("Only vless:// and vmess:// links are supported.");
  }

  return {
    profile,
    configText: profileToConfigText(profile)
  };
}

function extractProxyLinksFromText(input) {
  const text = String(input || "").trim();
  if (!text) return [];

  const directMatches = text.match(/(?:vless|vmess):\/\/[^\s\"'<>\(\)]+/gi) || [];
  if (directMatches.length > 0) {
    return directMatches.map((item) => item.trim());
  }

  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    const fromDecoded = decoded.match(/(?:vless|vmess):\/\/[^\s\"'<>\(\)]+/gi) || [];
    return fromDecoded.map((item) => item.trim());
  } catch (_error) {
    return [];
  }
}

module.exports = {
  normalizeJsonConfig,
  sanitizeProfile,
  profileToConfigText,
  configTextToProfile,
  importProxyLink,
  extractProxyLinksFromText
};
