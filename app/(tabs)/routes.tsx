import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RouteMap, { RouteMapCoordinate, RouteMapStop } from "@/components/RouteMap";

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

type SearchSuggestion = {
  id: string;
  title: string;
  subtitle: string | null;
  lat: number;
  lng: number;
};

export default function RoutesScreen() {
  const NEPAL_VIEWBOX_NOMINATIM = "80.058,30.447,88.201,26.347";
  const NEPAL_BBOX_MAPTILER = "80.058,26.347,88.201,30.447";
  const MAP_FOCUS_ZOOM = 15;
  const { height: screenHeight } = useWindowDimensions();
  const backendBaseUrlRaw = process.env.EXPO_PUBLIC_BACKEND_URL;
  const maptilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  const [routeList, setRouteList] = useState<RouteSummary[]>([]);
  const [routeListLoading, setRouteListLoading] = useState(false);
  const [routeListError, setRouteListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeDetail, setRouteDetail] = useState<RouteDetail["route"] | null>(null);
  const [routeDetailLoading, setRouteDetailLoading] = useState(false);
  const [routeDetailError, setRouteDetailError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [pressedLocation, setPressedLocation] = useState<RouteMapCoordinate | null>(null);
  const [detailSearchQuery, setDetailSearchQuery] = useState("");
  const [detailSearchFocused, setDetailSearchFocused] = useState(false);
  const [detailSearchSuggestions, setDetailSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [detailSearchLoading, setDetailSearchLoading] = useState(false);
  const [detailSearchError, setDetailSearchError] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<RouteMapCoordinate | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const routeMapHeight = Math.max(380, Math.min(620, Math.round(screenHeight * 0.52)));
  const searchLookupId = React.useRef(0);
  const searchAbortRef = React.useRef<AbortController | null>(null);
  const copyFeedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveBackendBaseUrl = () => {
    if (!backendBaseUrlRaw) return null;
    const baseUrl = backendBaseUrlRaw.replace(/\/+$/, "");
    if (Platform.OS !== "android") return baseUrl;
    return baseUrl
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  };

  const backendBaseUrl = resolveBackendBaseUrl();

  const resetDetailSearch = () => {
    setDetailSearchQuery("");
    setDetailSearchFocused(false);
    setDetailSearchSuggestions([]);
    setDetailSearchLoading(false);
    setDetailSearchError(null);
    searchAbortRef.current?.abort();
  };

  const clearCopyFeedback = () => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    setCopyFeedback(null);
  };

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
    setPressedLocation(null);
    setFocusLocation(null);
    clearCopyFeedback();
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

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      clearCopyFeedback();
    };
  }, []);

  useEffect(() => {
    const query = detailSearchQuery.trim();
    if (!detailSearchFocused || query.length < 2) {
      setDetailSearchSuggestions([]);
      setDetailSearchLoading(false);
      setDetailSearchError(null);
      searchAbortRef.current?.abort();
      return;
    }

    const requestId = (searchLookupId.current += 1);
    setDetailSearchLoading(true);
    setDetailSearchError(null);

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const mapSuggestions = (items: SearchSuggestion[]) => items.filter(Boolean).slice(0, 5);

        const fetchMapTilerSuggestions = async (preferNepal: boolean, q: string) => {
          if (!maptilerKey) return [];
          const params = new URLSearchParams({
            key: maptilerKey,
            limit: "5",
            language: "en",
            types:
              "poi,address,place,locality,neighbourhood,road,postal_code,region,subregion,county,municipality,country",
          });
          if (preferNepal) {
            params.set("country", "np");
            params.set("bbox", NEPAL_BBOX_MAPTILER);
          }

          const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
            q
          )}.json?${params.toString()}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error(`Search failed (${response.status})`);

          const data = await response.json();
          const features = Array.isArray(data?.features) ? data.features : [];
          return features
            .map((feature: any) => {
              const center = Array.isArray(feature?.center)
                ? feature.center
                : Array.isArray(feature?.geometry?.coordinates)
                  ? feature.geometry.coordinates
                  : null;
              if (!center || center.length < 2) return null;
              const [lng, lat] = center;
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const title = feature?.text || feature?.place_name?.split(",")[0] || "Result";
              const subtitle = feature?.place_name || null;
              return {
                id: String(feature?.id ?? `${lat},${lng}`),
                title,
                subtitle,
                lat,
                lng,
              } as SearchSuggestion;
            })
            .filter(Boolean)
            .slice(0, 5);
        };

        const fetchNominatimSuggestions = async (preferNepal: boolean, q: string) => {
          const params = new URLSearchParams({
            format: "jsonv2",
            addressdetails: "1",
            limit: "5",
            q,
          });
          if (preferNepal) {
            params.set("countrycodes", "np");
            params.set("viewbox", NEPAL_VIEWBOX_NOMINATIM);
            params.set("bounded", "0");
          }

          const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "Accept-Language": "en",
              "User-Agent": "RouteApp/1.0",
            },
          });
          if (!response.ok) throw new Error(`Search failed (${response.status})`);

          const data = await response.json();
          return Array.isArray(data)
            ? data
                .map((item: any) => {
                  const lat = Number(item?.lat);
                  const lng = Number(item?.lon);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                  const rawName = item?.name || "";
                  const displayName = item?.display_name || "";
                  const title = rawName || displayName.split(",")[0] || "Result";
                  const subtitle = displayName && displayName !== title ? displayName : null;
                  return {
                    id: String(item?.place_id ?? `${lat},${lng}`),
                    title,
                    subtitle,
                    lat,
                    lng,
                  } as SearchSuggestion;
                })
                .filter(Boolean)
                .slice(0, 5)
            : [];
        };

        const variants = Array.from(new Set([query, query.replace(/\bhos(p)?$/i, "hospital")]));
        let suggestions: SearchSuggestion[] = [];

        for (const variant of variants) {
          suggestions = mapSuggestions(
            maptilerKey
              ? await fetchMapTilerSuggestions(true, variant)
              : await fetchNominatimSuggestions(true, variant)
          );
          if (searchLookupId.current !== requestId) return;
          if (suggestions.length > 0) break;

          suggestions = mapSuggestions(
            maptilerKey
              ? await fetchMapTilerSuggestions(false, variant)
              : await fetchNominatimSuggestions(false, variant)
          );
          if (searchLookupId.current !== requestId) return;
          if (suggestions.length > 0) break;
        }

        if (suggestions.length === 0 && maptilerKey) {
          for (const variant of variants) {
            suggestions = mapSuggestions(await fetchNominatimSuggestions(true, variant));
            if (searchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;

            suggestions = mapSuggestions(await fetchNominatimSuggestions(false, variant));
            if (searchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;
          }
        }

        setDetailSearchSuggestions(suggestions);
      } catch (error: any) {
        if (error?.name === "AbortError") return;
        if (searchLookupId.current !== requestId) return;
        setDetailSearchError("Unable to fetch suggestions.");
        setDetailSearchSuggestions([]);
      } finally {
        if (searchLookupId.current === requestId) {
          setDetailSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    detailSearchFocused,
    detailSearchQuery,
    maptilerKey,
    NEPAL_BBOX_MAPTILER,
    NEPAL_VIEWBOX_NOMINATIM,
  ]);

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

    return selectedVariantStops
      .map((stop) => ({
        lng: Number(stop.station.lon),
        lat: Number(stop.station.lat),
      }))
      .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  }, [selectedVariant, selectedVariantStops]);

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

  const handleDetailSearchSelect = (item: SearchSuggestion) => {
    Keyboard.dismiss();
    setDetailSearchQuery(item.title);
    setDetailSearchSuggestions([]);
    setDetailSearchLoading(false);
    setDetailSearchError(null);
    const selected = { lng: item.lng, lat: item.lat };
    setFocusLocation(selected);
    setPressedLocation(selected);
    clearCopyFeedback();
  };

  const handleCopyPressedLocation = () => {
    if (!pressedLocation) return;
    const value = `lat: ${pressedLocation.lat.toFixed(8)}\nlon: ${pressedLocation.lng.toFixed(8)}`;
    Clipboard.setString(value);
    clearCopyFeedback();
    setCopyFeedback("Copied");
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, 1500);
  };

  if (selectedRouteId && (routeDetail || routeDetailLoading || routeDetailError)) {
    return (
      <SafeAreaView edges={["top"]} style={styles.container}>
        <View style={styles.detailHeader}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              setSelectedRouteId(null);
              setRouteDetail(null);
              setRouteDetailError(null);
              setSelectedVariantId(null);
              setPressedLocation(null);
              setFocusLocation(null);
              resetDetailSearch();
              clearCopyFeedback();
            }}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.detailTitle}>{routeDetail?.name ?? "Route Detail"}</Text>
        </View>

        {routeDetailLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#1FAE66" />
            <Text style={styles.stateText}>Loading route map...</Text>
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
              contentContainerStyle={styles.variantRow}
            >
              {routeDetail.variants.map((variant) => (
                <Pressable
                  key={variant.id}
                  style={[
                    styles.variantChip,
                    selectedVariantId === variant.id ? styles.variantChipActive : null,
                  ]}
                  onPress={() => {
                    setSelectedVariantId(variant.id);
                    setPressedLocation(null);
                    clearCopyFeedback();
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
                      selectedVariantId === variant.id ? styles.variantChipTextActive : null,
                    ]}
                  >
                    {variant.direction.toUpperCase()} ({variant.stopCount})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.detailSearchWrap}>
              <TextInput
                value={detailSearchQuery}
                onChangeText={setDetailSearchQuery}
                placeholder="Search area to pan map"
                placeholderTextColor="rgba(255,255,255,0.48)"
                style={styles.detailSearchInput}
                returnKeyType="search"
                onFocus={() => setDetailSearchFocused(true)}
                onBlur={() => setDetailSearchFocused(false)}
              />
              {detailSearchFocused &&
              (detailSearchLoading || detailSearchError || detailSearchQuery.trim().length >= 2) ? (
                <View style={styles.detailSuggestionsPanel}>
                  {detailSearchLoading ? (
                    <Text style={styles.detailSuggestionStatus}>Searching...</Text>
                  ) : detailSearchError ? (
                    <Text style={styles.detailSuggestionStatus}>{detailSearchError}</Text>
                  ) : detailSearchQuery.trim().length >= 2 &&
                    detailSearchSuggestions.length === 0 ? (
                    <Text style={styles.detailSuggestionStatus}>No results found.</Text>
                  ) : (
                    detailSearchSuggestions.map((item, index) => (
                      <Pressable
                        key={item.id}
                        onPress={() => handleDetailSearchSelect(item)}
                        style={({ pressed }) => [
                          styles.detailSuggestionItem,
                          pressed ? { backgroundColor: "rgba(255,255,255,0.06)" } : null,
                        ]}
                      >
                        <Text style={styles.detailSuggestionTitle}>{item.title}</Text>
                        {item.subtitle ? (
                          <Text style={styles.detailSuggestionSubtitle}>{item.subtitle}</Text>
                        ) : null}
                        {index < detailSearchSuggestions.length - 1 ? (
                          <View style={styles.detailSuggestionDivider} />
                        ) : null}
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </View>

            <View style={[styles.mapFrame, { height: routeMapHeight }]}>
              <RouteMap
                routeCoordinates={routeCoordinates}
                stops={mapStops}
                focusLocation={focusLocation}
                focusZoom={MAP_FOCUS_ZOOM}
                onMapPress={(location) => {
                  setPressedLocation(location);
                  clearCopyFeedback();
                }}
              />
            </View>

            <View style={styles.coordinateCard}>
              <View style={styles.coordinateTitleRow}>
                <Text style={styles.coordinateTitle}>Tapped Point</Text>
                <Pressable
                  style={[
                    styles.copyButton,
                    !pressedLocation ? styles.copyButtonDisabled : null,
                  ]}
                  onPress={handleCopyPressedLocation}
                  disabled={!pressedLocation}
                >
                  <Text style={styles.copyButtonText}>Copy lon/lat</Text>
                </Pressable>
              </View>
              <Text style={styles.coordinateText}>
                Lat: {pressedLocation ? String(pressedLocation.lat) : "-"}
              </Text>
              <Text style={styles.coordinateText}>
                Lon: {pressedLocation ? String(pressedLocation.lng) : "-"}
              </Text>
              {copyFeedback ? (
                <Text style={styles.copyFeedbackText}>{copyFeedback}</Text>
              ) : null}
            </View>

            <ScrollView style={styles.stopsList} contentContainerStyle={styles.stopsListContent}>
              {selectedVariantStops.map((stop) => (
                <View key={`${selectedVariant.id}_${stop.stopSequence}`} style={styles.stopRow}>
                  <Text style={styles.stopName}>
                    {stop.stopSequence}. {stop.station.name}
                  </Text>
                  <Text style={styles.stopMeta}>Lat: {String(stop.station.lat)}</Text>
                  <Text style={styles.stopMeta}>Lon: {String(stop.station.lon)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={styles.listHeader}>
        <Text style={styles.headerTitle}>All Bus Routes</Text>
        <Pressable style={styles.reloadButton} onPress={loadRoutes}>
          <Text style={styles.reloadButtonText}>Reload</Text>
        </Pressable>
      </View>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search route name"
        placeholderTextColor="rgba(255,255,255,0.48)"
        style={styles.searchInput}
      />

      {routeListLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#1FAE66" />
          <Text style={styles.stateText}>Loading routes...</Text>
        </View>
      ) : routeListError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{routeListError}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.routeList}>
          {filteredRoutes.map((route) => (
            <Pressable
              key={route.id}
              style={({ pressed }) => [styles.routeCard, pressed ? styles.routeCardPressed : null]}
              onPress={() => {
                setSelectedRouteId(route.id);
                loadRouteDetail(route.id);
              }}
            >
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.routeMeta}>
                {route.directionality} {route.isLoop ? " | loop" : ""}
              </Text>
              <Text style={styles.routeId}>{route.id}</Text>
            </Pressable>
          ))}
          {filteredRoutes.length === 0 ? (
            <Text style={styles.stateText}>No matching routes found.</Text>
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
  detailSearchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  detailSearchInput: {
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "white",
    paddingHorizontal: 12,
    fontSize: 14,
  },
  detailSuggestionsPanel: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  detailSuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailSuggestionTitle: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  detailSuggestionSubtitle: {
    marginTop: 2,
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
  },
  detailSuggestionDivider: {
    height: 1,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  detailSuggestionStatus: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
  },
  variantRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
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
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  coordinateCard: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  coordinateTitle: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  coordinateTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  coordinateText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    marginTop: 2,
  },
  copyButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#1FAE66",
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonDisabled: {
    opacity: 0.5,
  },
  copyButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  copyFeedbackText: {
    marginTop: 8,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
  },
  stopsList: {
    flex: 1,
    marginTop: 10,
  },
  stopsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  stopRow: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stopName: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  stopMeta: {
    marginTop: 2,
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
  },
});
