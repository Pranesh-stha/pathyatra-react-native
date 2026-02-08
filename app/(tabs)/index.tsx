import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapBackground from "../../components/MapBackground";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      {/* Background map */}
      <View style={StyleSheet.absoluteFill}>
        <MapBackground />
      </View>

      {/* Your UI overlay */}
      <SafeAreaView edges={["top"]} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.card} pointerEvents="auto">
          <Text style={styles.title}>Home</Text>
          <Text style={styles.sub}>Your content sits on top of the map.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(20,20,20,0.70)",
  },
  title: { color: "white", fontSize: 22, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.8)", marginTop: 6 },
});
