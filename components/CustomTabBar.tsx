import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  explore: "compass-outline",
  routes: "map-outline",
  settings: "settings-outline",
};

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  return (
    <SafeAreaView
      edges={["bottom"]}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={styles.borderContainer}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];

            const label =
              options.tabBarLabel?.toString() ?? options.title ?? route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const iconName = ICONS[route.name] ?? ("ellipse-outline" as const);

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={[styles.item, isFocused && styles.itemActive]}
              >
                <Ionicons
                  name={iconName}
                  size={22}
                  color={isFocused ? "#10B981" : "rgba(255,255,255,0.75)"}
                  style={
                    isFocused
                      ? {
                          shadowColor: "#10B981",
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 12,
                        }
                      : undefined
                  }
                />
                <Text style={[styles.label, isFocused && styles.labelActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: -2.4,
    right: -2.4,
    bottom: -1,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    backgroundColor: "rgba(18,18,18,0.98)",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  item: {
    flex: 1,
    height: 65,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  itemActive: {},
  label: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
  labelActive: {
    color: "#10B981",
    fontWeight: "700",
  },
  borderContainer: {
    width: "100%",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    paddingTop: 1,
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: "#656565",
  },
});
