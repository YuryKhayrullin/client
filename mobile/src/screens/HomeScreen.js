import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { CameraScreen } from "react-native-camera-kit";

import SignalOrb from "../components/SignalOrb";
import StatusBadge from "../components/StatusBadge";
import { useProxyController } from "../state/useProxyController";

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize = "none" }) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={String(value ?? "")}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7b8191"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function ModeSwitch({ value, onChange }) {
  return (
    <View style={styles.modeSwitch}>
      <TouchableOpacity
        onPress={() => onChange("simple")}
        style={[styles.modeButton, value === "simple" ? styles.modeButtonActive : null]}
      >
        <Text style={[styles.modeLabel, value === "simple" ? styles.modeLabelActive : null]}>Simple</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onChange("advanced")}
        style={[styles.modeButton, value === "advanced" ? styles.modeButtonActive : null]}
      >
        <Text style={[styles.modeLabel, value === "advanced" ? styles.modeLabelActive : null]}>Advanced JSON</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen() {
  const {
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
  } = useProxyController();

  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  async function handleClipboardImport() {
    try {
      const text = await Clipboard.getString();
      await importFromClipboard(text);
      if (!running) {
        await toggleConnection();
      }
    } catch (_error) {}
  }

  async function handleScanRead(event) {
    if (scanBusy) return;

    const value = String(event?.nativeEvent?.codeStringValue || "").trim();
    if (!value) return;

    setScanBusy(true);
    try {
      await importFromQr(value);
      setScannerVisible(false);
      if (!running) {
        await toggleConnection();
      }
    } catch (_error) {
    } finally {
      setTimeout(() => setScanBusy(false), 500);
    }
  }

  if (scannerVisible) {
    return (
      <SafeAreaView style={styles.scannerRoot}>
        <StatusBar barStyle="light-content" />
        <View style={styles.scannerHeader}>
          <Text style={styles.scannerTitle}>Scan QR</Text>
          <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.scannerCloseButton}>
            <Text style={styles.scannerCloseLabel}>Close</Text>
          </TouchableOpacity>
        </View>
        <CameraScreen
          scanBarcode
          onReadCode={handleScanRead}
          showFrame
          laserColor="#2f7bff"
          frameColor="#deecff"
          style={styles.scannerCamera}
        />
        <Text style={styles.scannerHint}>Point camera at a QR code with vless://, vmess:// or https:// subscription</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.title}>Horizon Tunnel</Text>
          <Text style={styles.subtitle}>Android proxy client with fast VLESS and VMess import</Text>

          <View style={styles.statusRow}>
            <StatusBadge running={running} />
            <TouchableOpacity disabled={busy} onPress={refreshStatus} style={styles.refreshButton}>
              <Text style={styles.refreshLabel}>Refresh</Text>
            </TouchableOpacity>
          </View>

          <SignalOrb running={running} busy={busy} onPress={toggleConnection} />

          <Text style={styles.message}>{message}</Text>
          <Text style={styles.endpoint}>SOCKS5 endpoint: {statusDetails.socks}</Text>
          {connectedSinceText ? <Text style={styles.connectedSince}>Running since {connectedSinceText}</Text> : null}
        </View>

        <View style={styles.panel}>
          <ModeSwitch value={mode} onChange={switchMode} />

          {mode === "simple" ? (
            <View style={styles.simpleBlock}>
              <View style={styles.importCard}>
                <Text style={styles.importTitle}>Quick import</Text>
                <Text style={styles.importText}>Paste vless://, vmess:// or https:// subscription and profile will fill automatically.</Text>
                <TextInput
                  multiline
                  value={importLinkText}
                  onChangeText={setImportLinkText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="vless://... vmess://... or https://..."
                  placeholderTextColor="#7b8191"
                  style={styles.linkInput}
                  textAlignVertical="top"
                />
                <View style={styles.importActionsRow}>
                  <TouchableOpacity disabled={busy} onPress={importLink} style={styles.importButton}>
                    <Text style={styles.importButtonLabel}>Import Link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} onPress={handleClipboardImport} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonLabel}>Clipboard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => setScannerVisible(true)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonLabel}>Scan QR</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <LabeledInput
                label="Profile name"
                value={profile.name}
                onChangeText={(value) => updateSimpleField("name", value)}
                placeholder="Work"
                autoCapitalize="words"
              />
              <LabeledInput
                label="Server"
                value={profile.server}
                onChangeText={(value) => updateSimpleField("server", value)}
                placeholder="vpn.example.com"
              />
              <LabeledInput
                label="Port"
                value={String(profile.port)}
                onChangeText={(value) => updateSimpleField("port", value.replace(/[^0-9]/g, ""))}
                placeholder="443"
                keyboardType="number-pad"
              />
              <LabeledInput
                label="UUID"
                value={profile.uuid}
                onChangeText={(value) => updateSimpleField("uuid", value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <LabeledInput
                label="SNI"
                value={profile.sni}
                onChangeText={(value) => updateSimpleField("sni", value)}
                placeholder="vpn.example.com"
              />

              <Text style={styles.inputLabel}>Transport security</Text>
              <View style={styles.securityRow}>
                <TouchableOpacity
                  onPress={() => updateSimpleField("security", "tls")}
                  style={[styles.securityChip, profile.security === "tls" ? styles.securityChipActive : null]}
                >
                  <Text style={[styles.securityLabel, profile.security === "tls" ? styles.securityLabelActive : null]}>
                    TLS
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => updateSimpleField("security", "none")}
                  style={[styles.securityChip, profile.security === "none" ? styles.securityChipActive : null]}
                >
                  <Text style={[styles.securityLabel, profile.security === "none" ? styles.securityLabelActive : null]}>
                    NONE
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.advancedBlock}>
              <Text style={styles.inputLabel}>Xray JSON config</Text>
              <TextInput
                multiline
                value={configText}
                onChangeText={setConfigText}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.configInput}
                textAlignVertical="top"
              />
            </View>
          )}

          <TouchableOpacity disabled={busy} onPress={save} style={styles.saveButton}>
            <Text style={styles.saveLabel}>Save Configuration</Text>
          </TouchableOpacity>

          {statusDetails.lastError ? <Text style={styles.errorText}>Last core error: {statusDetails.lastError}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#081325"
  },
  container: {
    paddingBottom: 28
  },
  hero: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 28
  },
  title: {
    color: "#f2f7ff",
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 6,
    color: "#b9c6dd",
    fontSize: 14,
    fontWeight: "500"
  },
  statusRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  refreshButton: {
    backgroundColor: "#1d304f",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  refreshLabel: {
    color: "#deebff",
    fontWeight: "700",
    fontSize: 12
  },
  message: {
    marginTop: 6,
    color: "#e8f0ff",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "600"
  },
  endpoint: {
    marginTop: 10,
    color: "#bcd0f4",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600"
  },
  connectedSince: {
    marginTop: 4,
    color: "#97accc",
    fontSize: 12,
    textAlign: "center"
  },
  panel: {
    marginHorizontal: 14,
    marginTop: -6,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#f3f6fc"
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "#dde5f2",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  modeButtonActive: {
    backgroundColor: "#ffffff"
  },
  modeLabel: {
    color: "#41506a",
    fontWeight: "700",
    fontSize: 12
  },
  modeLabelActive: {
    color: "#1b2a47"
  },
  simpleBlock: {
    gap: 11
  },
  advancedBlock: {
    gap: 8
  },
  importCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#e9eefb",
    gap: 8
  },
  importTitle: {
    color: "#152a52",
    fontWeight: "800",
    fontSize: 15
  },
  importText: {
    color: "#536684",
    fontSize: 12,
    lineHeight: 18
  },
  linkInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#bfd0ec",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: "#101727",
    fontSize: 13,
    backgroundColor: "#ffffff"
  },
  importActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  importButton: {
    backgroundColor: "#173f9a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  importButtonLabel: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13
  },
  secondaryButton: {
    backgroundColor: "#dbe6fb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  secondaryButtonLabel: {
    color: "#183869",
    fontWeight: "800",
    fontSize: 12
  },
  inputWrap: {
    gap: 6
  },
  inputLabel: {
    color: "#1a2f54",
    fontWeight: "700",
    fontSize: 12
  },
  input: {
    borderWidth: 1,
    borderColor: "#c6d1e3",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f1933",
    backgroundColor: "#ffffff"
  },
  securityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4
  },
  securityChip: {
    borderWidth: 1,
    borderColor: "#bfd0ec",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#ffffff"
  },
  securityChipActive: {
    borderColor: "#2868ee",
    backgroundColor: "#eaf1ff"
  },
  securityLabel: {
    color: "#385079",
    fontWeight: "700",
    fontSize: 12
  },
  securityLabelActive: {
    color: "#1648bb"
  },
  configInput: {
    minHeight: 280,
    borderWidth: 1,
    borderColor: "#c6d1e3",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: "#101727",
    fontSize: 13,
    backgroundColor: "#ffffff",
    fontFamily: "monospace"
  },
  saveButton: {
    marginTop: 14,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#244dc0"
  },
  saveLabel: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14
  },
  errorText: {
    marginTop: 10,
    color: "#9e2a2a",
    fontSize: 12,
    fontWeight: "600"
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: "#061023"
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  scannerTitle: {
    color: "#ecf3ff",
    fontSize: 18,
    fontWeight: "800"
  },
  scannerCloseButton: {
    borderRadius: 10,
    backgroundColor: "#1f355f",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scannerCloseLabel: {
    color: "#ffffff",
    fontWeight: "700"
  },
  scannerCamera: {
    flex: 1
  },
  scannerHint: {
    color: "#b8c8e5",
    paddingHorizontal: 18,
    paddingVertical: 14,
    textAlign: "center",
    fontSize: 12
  }
});
