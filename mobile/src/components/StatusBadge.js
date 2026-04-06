import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function StatusBadge({ running }) {
  return (
    <View style={[styles.wrapper, running ? styles.onlineWrapper : styles.offlineWrapper]}>
      <View style={[styles.dot, running ? styles.onlineDot : styles.offlineDot]} />
      <Text style={[styles.label, running ? styles.onlineText : styles.offlineText]}>
        {running ? "Connected" : "Disconnected"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  onlineWrapper: {
    backgroundColor: "#d8f4e3"
  },
  offlineWrapper: {
    backgroundColor: "#f9d9d9"
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  onlineDot: {
    backgroundColor: "#0f9f5d"
  },
  offlineDot: {
    backgroundColor: "#c23434"
  },
  label: {
    fontSize: 13,
    fontWeight: "700"
  },
  onlineText: {
    color: "#0a6e41"
  },
  offlineText: {
    color: "#8f2626"
  }
});
