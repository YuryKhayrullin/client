const DEFAULT_VLESS_CONFIG = {
  log: {
    loglevel: "warning"
  },
  inbounds: [
    {
      tag: "socks-in",
      listen: "127.0.0.1",
      port: 10808,
      protocol: "socks",
      settings: {
        auth: "noauth",
        udp: true
      }
    }
  ],
  outbounds: [
    {
      protocol: "vless",
      settings: {
        vnext: [
          {
            address: "YOUR_SERVER",
            port: 443,
            users: [{ id: "UUID" }]
          }
        ]
      },
      streamSettings: {
        network: "tcp",
        security: "tls"
      }
    }
  ]
};

const DEFAULT_CONFIG_TEXT = JSON.stringify(DEFAULT_VLESS_CONFIG, null, 2);

function parseUserConfig(configText) {
  const parsed = JSON.parse(configText);

  if (!Array.isArray(parsed.outbounds) || parsed.outbounds.length === 0) {
    throw new Error("Xray config must include at least one outbound.");
  }

  if (!Array.isArray(parsed.inbounds) || parsed.inbounds.length === 0) {
    parsed.inbounds = DEFAULT_VLESS_CONFIG.inbounds;
  }

  return parsed;
}

function normalizeConfigText(configText) {
  const parsed = parseUserConfig(configText);
  return JSON.stringify(parsed, null, 2);
}

module.exports = {
  DEFAULT_VLESS_CONFIG,
  DEFAULT_CONFIG_TEXT,
  parseUserConfig,
  normalizeConfigText
};
