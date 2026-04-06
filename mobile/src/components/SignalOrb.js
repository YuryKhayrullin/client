import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export default function SignalOrb({ running, busy, onPress }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running && !busy) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true
        })
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [busy, pulse, running]);

  const animatedScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16]
  });

  const animatedOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0.08]
  });

  const mainColor = running ? "#1d8f5b" : "#2b59dc";

  return (
    <View style={styles.container}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outer,
          {
            backgroundColor: mainColor,
            opacity: animatedOpacity,
            transform: [{ scale: animatedScale }]
          }
        ]}
      />

      <Pressable
        disabled={busy}
        onPress={onPress}
        style={[styles.center, { backgroundColor: mainColor }, busy && styles.disabled]}
      >
        <Text style={styles.title}>{busy ? "Working..." : running ? "Stop" : "Start"}</Text>
        <Text style={styles.subtitle}>{running ? "Tunnel active" : "Tap to connect"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
    alignSelf: "center"
  },
  outer: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 999
  },
  center: {
    width: 152,
    height: 152,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  disabled: {
    opacity: 0.65
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800"
  },
  subtitle: {
    marginTop: 4,
    color: "#edf3ff",
    fontSize: 12,
    fontWeight: "600"
  }
});
