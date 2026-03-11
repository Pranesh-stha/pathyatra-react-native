import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  APP_TAB_BAR_BORDER_TOP_WIDTH,
  APP_TAB_BAR_ITEM_HEIGHT,
  APP_TAB_BAR_PADDING_TOP,
  getAppTabBarHeight,
} from "../constants/tabBar";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  routes: "map-outline",
  settings: "settings-outline",
};

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const tabBarHeight = getAppTabBarHeight(insets.bottom);

  const TAB_LABELS: Record<string, string> = {
    index: t.home,
    routes: t.routes,
    settings: t.settings,
  };
  const contentBottomInset =
    tabBarHeight -
    APP_TAB_BAR_PADDING_TOP -
    APP_TAB_BAR_ITEM_HEIGHT -
    APP_TAB_BAR_BORDER_TOP_WIDTH;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.borderContainer, { backgroundColor: isDark ? "#656565" : "rgba(0,0,0,0.12)" }]}>
        <View
          style={[
            styles.bar,
            {
              height: tabBarHeight - APP_TAB_BAR_BORDER_TOP_WIDTH,
              paddingBottom: contentBottomInset,
              backgroundColor: isDark ? "rgba(18,18,18,0.98)" : "rgba(195,210,222,0.98)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
            },
          ]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];

            const label = TAB_LABELS[route.name] ??
              options.tabBarLabel?.toString() ?? options.title ?? route.name;

            const onPress = () => {
              if (Platform.OS === "ios") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
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
                  color={isFocused ? "#10B981" : isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.45)"}
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
                <Text style={[
                  styles.label,
                  { color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)" },
                  isFocused && styles.labelActive,
                ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: APP_TAB_BAR_PADDING_TOP,
    paddingBottom: 12,
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
