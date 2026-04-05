const React = require("react");
const { createRoot } = require("react-dom/client");
const { ipcRenderer } = require("electron");
const { normalizeConfigText } = require("../shared/config");
const { createDesktopRendererManager } = require("../shared/xrayManager");

const xrayManager = createDesktopRendererManager(ipcRenderer);

function App() {
  const [configText, setConfigText] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("Disconnected");

  React.useEffect(() => {
    init().catch((error) => setMessage("Init error: " + error.message));
  }, []);

  async function init() {
    const saved = await xrayManager.loadConfig();
    setConfigText(saved);
    const status = await xrayManager.getStatus();
    setConnected(Boolean(status && status.running));
  }

  async function saveConfig() {
    try {
      const normalized = normalizeConfigText(configText);
      await xrayManager.saveConfig(normalized);
      setConfigText(normalized);
      setMessage("Config saved");
    } catch (error) {
      setMessage("Invalid JSON: " + error.message);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const normalized = normalizeConfigText(configText);
      setConfigText(normalized);
      const status = await xrayManager.start(normalized);
      setConnected(Boolean(status && status.running));
      setMessage("Connected. SOCKS5: " + ((status && status.socks) || "127.0.0.1:10808"));
    } catch (error) {
      setConnected(false);
      setMessage("Connect failed: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await xrayManager.stop();
      setConnected(false);
      setMessage("Disconnected");
    } catch (error) {
      setMessage("Disconnect failed: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  return React.createElement(
    "div",
    { className: "panel" },
    React.createElement("h2", null, "Xray Personal Client"),
    React.createElement(
      "div",
      { className: "status-row" },
      React.createElement("span", { className: "dot " + (connected ? "online" : "offline") }),
      React.createElement("strong", null, connected ? "Connected" : "Disconnected")
    ),
    React.createElement(
      "div",
      { className: "button-row" },
      connected
        ? React.createElement("button", { className: "danger", onClick: disconnect, disabled: busy }, busy ? "Please wait..." : "Disconnect")
        : React.createElement("button", { className: "primary", onClick: connect, disabled: busy }, busy ? "Please wait..." : "Connect"),
      React.createElement("button", { className: "secondary", onClick: saveConfig, disabled: busy }, "Save Config")
    ),
    React.createElement("p", { className: "hint" }, "Paste VLESS/VMess Xray JSON config below."),
    React.createElement("textarea", { value: configText, onChange: (event) => setConfigText(event.target.value) }),
    React.createElement("p", { className: "hint" }, message)
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
