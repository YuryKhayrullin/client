import React, { useEffect, useMemo, useState } from "react";
import {
  NativeModules,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { normalizeConfigText, DEFAULT_CONFIG_TEXT } = require("../shared/config");
const { createMobileManager } = require("../shared/xrayManager");

const STORAGE_KEY = "xray_config";
const xrayManager = createMobileManager(NativeModules);

export default function App() {
  const [configText, setConfigText] = useState(DEFAULT_CONFIG_TEXT);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Disconnected");

  useEffect(() => {
    bootstrap().catch((error) => setMessage("Init error: " + error.message));
  }, []);

  const statusText = useMemo(() => (connected ? "Connected" : "Disconnected"), [connected]);

  async function bootstrap() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) setConfigText(saved);

    try {
      const status = await xrayManager.getStatus();
      setConnected(Boolean(status && status.running));
    } catch (_error) {
      setConnected(false);
    }
  }

  async function saveConfig() {
    try {
      const normalized = normalizeConfigText(configText);
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
      setConfigText(normalized);
      setMessage("Config saved");
    } catch (error) {
      setMessage("Invalid JSON: " + error.message);
    }
  }

  async function toggleConnection() {
    setBusy(true);
    try {
      if (connected) {
        await xrayManager.stop();
        setConnected(false);
        setMessage("Disconnected");
      } else {
        const normalized = normalizeConfigText(configText);
        await AsyncStorage.setItem(STORAGE_KEY, normalized);
        setConfigText(normalized);
        await xrayManager.start(normalized);
        setConnected(true);
        setMessage("Connected. SOCKS5: 127.0.0.1:10808");
      }
    } catch (error) {
      setMessage("Action failed: " + error.message);
      setConnected(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Xray Personal Client</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusLabel}>{statusText}</Text>
        </View>

        <TouchableOpacity
          disabled={busy}
          onPress={toggleConnection}
          style={[styles.button, connected ? styles.disconnect : styles.connect]}
        >
          <Text style={styles.buttonText}>{busy ? "Please wait..." : connected ? "Disconnect" : "Connect"}</Text>
        </TouchableOpacity>

        <TouchableOpacity disabled={busy} onPress={saveConfig} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Save Config</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Xray JSON Config (VLESS/VMess)</Text>
        <TextInput
          multiline
          value={configText}
          onChangeText={setConfigText}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.message}>{message}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7fb" },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#1b1b1b" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  dot: { width: 12, height: 12, borderRadius: 999 },
  dotOnline: { backgroundColor: "#1f9d55" },
  dotOffline: { backgroundColor: "#d64545" },
  statusLabel: { fontSize: 16, fontWeight: "600" },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  connect: { backgroundColor: "#2a68ff" },
  disconnect: { backgroundColor: "#c13d3d" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  secondaryButton: { borderWidth: 1, borderColor: "#b8c2d1", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  secondaryText: { fontWeight: "600", color: "#2b3340" },
  sectionTitle: { marginTop: 8, fontSize: 14, fontWeight: "700", color: "#2b3340" },
  input: { minHeight: 320, borderWidth: 1, borderColor: "#d6dee9", borderRadius: 10, backgroundColor: "white", padding: 12, textAlignVertical: "top", fontFamily: "monospace" },
  message: { marginTop: 8, color: "#4b5563" }
});
