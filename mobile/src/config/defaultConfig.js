const DEFAULT_PROFILE = {
  name: "Primary",
  server: "example.com",
  port: 443,
  uuid: "11111111-1111-4111-8111-111111111111",
  sni: "example.com",
  security: "tls",
  alpn: "h2,http/1.1",
  bypassDomains: "geosite:private",
  bypassCidrs: "geoip:private",
  blockedDomains: "geosite:category-ads-all",
  allowHttpSubscriptionHosts: "localhost,127.0.0.1,10.0.2.2"
};

function splitAlpn(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  return String(value || "")
    .split(/[\n,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildVlessConfig(profile) {
  const safeProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
    port: Number(profile?.port || DEFAULT_PROFILE.port)
  };

  const bypassDomains = splitList(safeProfile.bypassDomains);
  const bypassCidrs = splitList(safeProfile.bypassCidrs);
  const blockedDomains = splitList(safeProfile.blockedDomains);
  const routingRules = [];

  if (bypassDomains.length) {
    routingRules.push({
      type: "field",
      outboundTag: "direct",
      domain: bypassDomains
    });
  }

  if (bypassCidrs.length) {
    routingRules.push({
      type: "field",
      outboundTag: "direct",
      ip: bypassCidrs
    });
  }

  if (blockedDomains.length) {
    routingRules.push({
      type: "field",
      outboundTag: "block",
      domain: blockedDomains
    });
  }

  routingRules.push({ type: "field", outboundTag: "proxy", network: "tcp,udp" });

  return {
    log: { loglevel: "warning" },
    dns: { servers: ["1.1.1.1", "8.8.8.8"] },
    inbounds: [
      {
        tag: "socks-in",
        listen: "127.0.0.1",
        port: 10808,
        protocol: "socks",
        settings: { auth: "noauth", udp: true },
        sniffing: {
          enabled: true,
          destOverride: ["http", "tls"]
        }
      }
    ],
    outbounds: [
      {
        tag: "proxy",
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: safeProfile.server,
              port: safeProfile.port,
              users: [
                {
                  id: safeProfile.uuid,
                  encryption: "none"
                }
              ]
            }
          ]
        },
        streamSettings: {
          network: "tcp",
          security: safeProfile.security,
          tlsSettings:
            safeProfile.security === "tls"
              ? {
                  serverName: safeProfile.sni || safeProfile.server,
                  allowInsecure: false,
                  alpn: splitAlpn(safeProfile.alpn)
                }
              : undefined
        }
      },
      { tag: "direct", protocol: "freedom" },
      { tag: "block", protocol: "blackhole" }
    ],
    routing: {
      domainStrategy: "AsIs",
      rules: routingRules
    }
  };
}

const DEFAULT_CONFIG_TEXT = JSON.stringify(buildVlessConfig(DEFAULT_PROFILE), null, 2);

module.exports = {
  DEFAULT_PROFILE,
  DEFAULT_CONFIG_TEXT,
  buildVlessConfig
};
