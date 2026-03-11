import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMapStyle } from "@/context/MapStyleContext";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import RouteMap, { RouteMapStop } from "@/components/RouteMap";
import { getAppTabBarHeight } from "@/constants/tabBar";

type RouteSummary = {
  id: string;
  name: string;
  isLoop: boolean;
  directionality: "one_way" | "bidirectional";
  loopDirection: string | null;
};

type RouteVariantStop = {
  stopSequence: number;
  station: {
    id: string;
    name: string;
    lat: number;
    lon: number;
  };
};

type RouteVariant = {
  id: string;
  variantKey: string;
  direction: string;
  stopCount: number;
  shape: {
    type: "LineString";
    coordinates: number[][];
  } | null;
  stops: RouteVariantStop[];
};

type RouteDetail = {
  route: {
    id: string;
    name: string;
    isLoop: boolean;
    directionality: "one_way" | "bidirectional";
    loopDirection: string | null;
    variants: RouteVariant[];
  };
};

export default function RoutesScreen() {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const { mapId } = useMapStyle();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getAppTabBarHeight(insets.bottom);
  const r = {
    bg: isDark ? "#111315" : "#c8d4de",
    cardBg: isDark ? "rgba(255,255,255,0.06)" : "#d5e0ea",
    cardBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
    title: isDark ? "white" : "#1a1a1a",
    meta: isDark ? "rgba(255,255,255,0.70)" : "#4a5568",
    id: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)",
    inputBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    inputBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    inputText: isDark ? "white" : "#1a1a1a",
    inputPlaceholder: isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.4)",
    stateText: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.52)",
    backBtn: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    backBtnText: isDark ? "white" : "#1a1a1a",
    chipInactive: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    chipTextInactive: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.62)",
    mapBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    hintText: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.48)",
  };
  const backendBaseUrlRaw = process.env.EXPO_PUBLIC_BACKEND_URL;
  const [routeList, setRouteList] = useState<RouteSummary[]>([]);
  const [routeListLoading, setRouteListLoading] = useState(false);
  const [routeListError, setRouteListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeDetail, setRouteDetail] = useState<RouteDetail["route"] | null>(null);
  const [routeDetailLoading, setRouteDetailLoading] = useState(false);
  const [routeDetailError, setRouteDetailError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const resolveBackendBaseUrl = () => {
    if (!backendBaseUrlRaw) return null;
    const baseUrl = backendBaseUrlRaw.replace(/\/+$/, "");
    if (Platform.OS !== "android") return baseUrl;
    return baseUrl
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  };

  const backendBaseUrl = resolveBackendBaseUrl();

  const loadRoutes = async () => {
    if (!backendBaseUrl) {
      setRouteListError("Set EXPO_PUBLIC_BACKEND_URL in .env to load routes.");
      return;
    }
    setRouteListLoading(true);
    setRouteListError(null);
    try {
      const response = await fetch(`${backendBaseUrl}/v1/routes`, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Failed to fetch routes (${response.status}).`);
      }
      const routes = Array.isArray(payload?.routes) ? payload.routes : [];
      setRouteList(routes);
    } catch (error: any) {
      setRouteListError(error?.message || "Unable to load routes.");
      setRouteList([]);
    } finally {
      setRouteListLoading(false);
    }
  };

  const loadRouteDetail = async (
    routeId: string,
    options?: { shapeVariantId?: string; keepCurrent?: boolean }
  ) => {
    if (!backendBaseUrl) {
      setRouteDetailError("Set EXPO_PUBLIC_BACKEND_URL in .env to load route details.");
      return;
    }
    const shapeVariantId = options?.shapeVariantId ?? undefined;
    const keepCurrent = Boolean(options?.keepCurrent);
    setRouteDetailLoading(true);
    setRouteDetailError(null);
    if (!keepCurrent) {
      setRouteDetail(null);
    }
    try {
      const params = new URLSearchParams();
      if (shapeVariantId) {
        params.set("shapeVariantId", shapeVariantId);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(
        `${backendBaseUrl}/v1/routes/${encodeURIComponent(routeId)}${
          params.toString() ? `?${params.toString()}` : ""
        }`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || `Failed to fetch route detail (${response.status}).`
        );
      }

      const route = payload?.route as RouteDetail["route"] | undefined;
      if (!route || !Array.isArray(route.variants)) {
        throw new Error("Invalid route detail response.");
      }
      setRouteDetail(route);
      if (shapeVariantId && route.variants.some((variant) => variant.id === shapeVariantId)) {
        setSelectedVariantId(shapeVariantId);
      } else {
        const firstVariant = route.variants[0] ?? null;
        setSelectedVariantId(firstVariant?.id ?? null);
      }
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.toLowerCase().includes("aborted")) {
        setRouteDetailError("Route map load timed out. Try again.");
      } else {
        setRouteDetailError(message || "Unable to load route detail.");
      }
    } finally {
      setRouteDetailLoading(false);
    }
  };

  useEffect(() => {
    loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return routeList;
    return routeList.filter((route) => route.name.toLowerCase().includes(query));
  }, [routeList, searchQuery]);

  const selectedVariant = useMemo(() => {
    if (!routeDetail || !selectedVariantId) return null;
    return routeDetail.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [routeDetail, selectedVariantId]);

  const selectedVariantStops = useMemo(() => {
    return (selectedVariant?.stops ?? [])
      .slice()
      .sort((a, b) => Number(a.stopSequence) - Number(b.stopSequence));
  }, [selectedVariant]);

  const routeCoordinates = useMemo(() => {
    if (selectedVariant?.shape?.type === "LineString" && Array.isArray(selectedVariant.shape.coordinates)) {
      const coords = selectedVariant.shape.coordinates
        .map((pair) => ({
          lng: Number(pair[0]),
          lat: Number(pair[1]),
        }))
        .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
      if (coords.length >= 2) return coords;
    }

    // Avoid misleading straight stop-to-stop lines when snapped geometry is unavailable.
    return [];
  }, [selectedVariant]);

  const mapStops: RouteMapStop[] = useMemo(
    () =>
      selectedVariantStops.map((stop) => ({
        id: stop.station.id,
        name: stop.station.name,
        lat: stop.station.lat,
        lon: stop.station.lon,
      })),
    [selectedVariantStops]
  );
  const hasSnappedRouteShape = routeCoordinates.length >= 2;

  if (selectedRouteId && (routeDetail || routeDetailLoading || routeDetailError)) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: r.bg }]}>
        <View style={styles.detailHeader}>
          <Pressable
            style={[styles.backButton, { backgroundColor: r.backBtn }]}
            onPress={() => {
              setSelectedRouteId(null);
              setRouteDetail(null);
              setRouteDetailError(null);
              setSelectedVariantId(null);
            }}
          >
            <Text style={[styles.backButtonText, { color: r.backBtnText }]}>{t.back}</Text>
          </Pressable>
          <Text style={[styles.detailTitle, { color: r.title }]}>{routeDetail?.name ?? t.routeDetail}</Text>
        </View>

        {routeDetailLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#1FAE66" />
            <Text style={[styles.stateText, { color: r.stateText }]}>{t.loadingRouteMap}</Text>
          </View>
        ) : routeDetailError ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{routeDetailError}</Text>
          </View>
        ) : routeDetail && selectedVariant ? (
          <View style={styles.detailBody}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.variantScroll}
              contentContainerStyle={styles.variantRow}
            >
              {routeDetail.variants.map((variant) => (
                <Pressable
                  key={variant.id}
                  style={[
                    styles.variantChip,
                    { backgroundColor: r.chipInactive },
                    selectedVariantId === variant.id ? styles.variantChipActive : null,
                  ]}
                  onPress={() => {
                    setSelectedVariantId(variant.id);
                    if (selectedRouteId) {
                      loadRouteDetail(selectedRouteId, {
                        shapeVariantId: variant.id,
                        keepCurrent: true,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.variantChipText,
                      { color: r.chipTextInactive },
                      selectedVariantId === variant.id ? styles.variantChipTextActive : null,
                    ]}
                  >
                    {variant.direction.toUpperCase()} ({variant.stopCount})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.mapFrame, { flex: 1, borderColor: r.mapBorder }]}>
              <RouteMap
                routeCoordinates={routeCoordinates}
                stops={mapStops}
                mapId={mapId}
              />
            </View>
            {!hasSnappedRouteShape && mapStops.length >= 2 ? (
              <Text style={[styles.routeShapeHint, { color: r.hintText }]}>
                {t.routeShapeUnavailable}
              </Text>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: r.bg }]}>
      <View style={styles.listHeader}>
        <Text style={[styles.headerTitle, { color: r.title }]}>{t.allBusRoutes}</Text>
        <Pressable style={styles.reloadButton} onPress={loadRoutes}>
          <Text style={styles.reloadButtonText}>{t.reload}</Text>
        </Pressable>
      </View>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t.searchRouteName}
        placeholderTextColor={r.inputPlaceholder}
        style={[styles.searchInput, { backgroundColor: r.inputBg, borderColor: r.inputBorder, color: r.inputText }]}
      />

      {routeListLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#1FAE66" />
          <Text style={[styles.stateText, { color: r.stateText }]}>{t.loadingRoutes}</Text>
        </View>
      ) : routeListError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{routeListError}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.routeList, { paddingBottom: tabBarHeight + 8 }]}>
          {filteredRoutes.map((route) => (
            <Pressable
              key={route.id}
              style={({ pressed }) => [styles.routeCard, { backgroundColor: r.cardBg, borderColor: r.cardBorder }, pressed ? styles.routeCardPressed : null]}
              onPress={() => {
                setSelectedRouteId(route.id);
                loadRouteDetail(route.id);
              }}
            >
              <Text style={[styles.routeName, { color: r.title }]}>{route.name}</Text>
              <Text style={[styles.routeMeta, { color: r.meta }]}>
                {route.directionality} {route.isLoop ? " | loop" : ""}
              </Text>
              <Text style={[styles.routeId, { color: r.id }]}>{route.id}</Text>
            </Pressable>
          ))}
          {filteredRoutes.length === 0 ? (
            <Text style={[styles.stateText, { color: r.stateText }]}>{t.noMatchingRoutes}</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111315",
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
  },
  reloadButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#1FAE66",
    alignItems: "center",
    justifyContent: "center",
  },
  reloadButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "white",
    paddingHorizontal: 12,
    fontSize: 15,
  },
  routeList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  routeCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  routeCardPressed: {
    opacity: 0.85,
  },
  routeName: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  routeMeta: {
    marginTop: 4,
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
  },
  routeId: {
    marginTop: 6,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stateText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 13,
    paddingHorizontal: 18,
    textAlign: "center",
  },
  detailHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  backButton: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  detailBody: {
    flex: 1,
  },
  variantScroll: {
    flexGrow: 0,
    paddingBottom: 6,
  },
  variantRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  variantChip: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  variantChipActive: {
    backgroundColor: "#1FAE66",
  },
  variantChipText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
  },
  variantChipTextActive: {
    color: "white",
  },
  mapFrame: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  routeShapeHint: {
    marginTop: 8,
    marginHorizontal: 18,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
});
