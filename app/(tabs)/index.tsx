import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapBackground, {
  MapBackgroundHandle,
  MapPolylineSegment,
} from "../../components/MapBackground";
import { getAppTabBarHeight } from "../../constants/tabBar";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { useMapStyle } from "../../context/MapStyleContext";

export default function HomeScreen() {
  const USER_FOCUS_ZOOM = 15;
  const BOTTOM_SHEET_PEEK_HEIGHT = 84;
  const NEPAL_VIEWBOX_NOMINATIM = "80.058,30.447,88.201,26.347";
  const NEPAL_BBOX_MAPTILER = "80.058,26.347,88.201,30.447";
  const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const insets = useSafeAreaInsets();
  const tabBarHeight = getAppTabBarHeight(insets.bottom);
  const mapRef = useRef<MapBackgroundHandle>(null);
  const maptilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  const searchInputRef = useRef<TextInput>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchLookupId = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const fromSearchInputRef = useRef<TextInput>(null);
  const [fromSearchQuery, setFromSearchQuery] = useState("");
  const [isFromSearchFocused, setIsFromSearchFocused] = useState(false);
  const [fromSearchSuggestions, setFromSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [fromSearchLoading, setFromSearchLoading] = useState(false);
  const [fromSearchError, setFromSearchError] = useState<string | null>(null);
  const fromSearchLookupId = useRef(0);
  const fromSearchAbortRef = useRef<AbortController | null>(null);
  const [showFromSelector, setShowFromSelector] = useState(false);
  const [customFromLocation, setCustomFromLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [fromPlaceTitle, setFromPlaceTitle] = useState<string>("Your location");
  const [fromPlaceSubtitle, setFromPlaceSubtitle] = useState<string | null>(null);
  const [initialCenter, setInitialCenter] = useState<{
    lng: number;
    lat: number;
    zoom?: number;
  } | null>(null);
  const [userCenter, setUserCenter] = useState<{
    lng: number;
    lat: number;
    zoom?: number;
  } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [selectedPlaceTitle, setSelectedPlaceTitle] = useState<string | null>(null);
  const [selectedPlaceSubtitle, setSelectedPlaceSubtitle] = useState<string | null>(null);
  const [selectedPlaceLoading, setSelectedPlaceLoading] = useState(false);
  const [selectedPlaceError, setSelectedPlaceError] = useState<string | null>(null);
  const placeLookupId = useRef(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tripPlanLoading, setTripPlanLoading] = useState(false);
  const [tripPlanError, setTripPlanError] = useState<string | null>(null);
  const [tripPlan, setTripPlan] = useState<TripItinerary | null>(null);
  const [tripSegments, setTripSegments] = useState<MapPolylineSegment[]>([]);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetTranslateYValueRef = useRef(0);
  const sheetDragStartRef = useRef(0);
  const maxSheetTranslateRef = useRef(0);
  const proximityLat = userCenter?.lat;
  const proximityLng = userCenter?.lng;
  const effectiveFromLocation = customFromLocation ?? userCenter;
  const maxSheetTranslate = Math.max(0, sheetHeight - BOTTOM_SHEET_PEEK_HEIGHT);
  const bottomCardBottomOffset = tabBarHeight + 8;
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const { mapId } = useMapStyle();
  const tc = {
    searchBarBg: isDark ? "rgba(20,20,20,0.82)" : "rgba(195,205,215,0.92)",
    searchBarBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
    inputText: isDark ? "white" : "#1a1a1a",
    inputPlaceholder: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.4)",
    suggestionsBg: isDark ? "rgba(20,20,20,0.9)" : "rgba(200,210,220,0.97)",
    suggestionsBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
    suggestionTitle: isDark ? "white" : "#1a1a1a",
    suggestionSubtitle: isDark ? "rgba(255,255,255,0.65)" : "#4a5568",
    suggestionDivider: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.09)",
    suggestionStatus: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)",
    cardBg: isDark ? "rgba(18,18,18,0.94)" : "rgba(195,207,218,0.95)",
    cardBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    cardTitle: isDark ? "white" : "#1a1a1a",
    cardText: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.62)",
    sheetHandle: isDark ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.22)",
    fromSelectorBg: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)",
    fromSelectorBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    fromSelectorLabel: isDark ? "rgba(255,255,255,0.70)" : "rgba(0,0,0,0.5)",
    fromSelectorValue: isDark ? "white" : "#1a1a1a",
    fromSelectorSubtitle: isDark ? "rgba(255,255,255,0.68)" : "#4a5568",
    fromSearchBg: isDark ? "rgba(20,20,20,0.78)" : "rgba(0,0,0,0.08)",
    fromSearchBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    mapControlsBg: isDark ? "rgba(20,20,20,0.70)" : "rgba(195,207,218,0.92)",
    mapControlsBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
    tripCardBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)",
    tripCardBorder: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
    tripTitle: isDark ? "white" : "#1a1a1a",
    tripValue: isDark ? "white" : "#1a1a1a",
    tripLabel: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.48)",
    tripMeta: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.52)",
    tripDot: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.28)",
    tripDivider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
    clearIconColor: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)",
  };

  const resolveBackendBaseUrl = () => {
    if (!BACKEND_BASE_URL) return null;
    const baseUrl = BACKEND_BASE_URL.replace(/\/+$/, "");
    if (Platform.OS !== "android") return baseUrl;
    // Android emulator cannot reach host machine via localhost.
    return baseUrl
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  };

  const clampSheetTranslate = useCallback((value: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, value));
  }, []);

  useEffect(() => {
    const listenerId = sheetTranslateY.addListener(({ value }) => {
      sheetTranslateYValueRef.current = value;
    });
    return () => {
      sheetTranslateY.removeListener(listenerId);
    };
  }, [sheetTranslateY]);

  useEffect(() => {
    maxSheetTranslateRef.current = maxSheetTranslate;
    if (!selectedLocation) {
      sheetTranslateY.stopAnimation();
      sheetTranslateY.setValue(0);
      sheetTranslateYValueRef.current = 0;
      setIsSheetCollapsed(false);
      return;
    }
    if (isSheetCollapsed) {
      sheetTranslateY.setValue(maxSheetTranslate);
      sheetTranslateYValueRef.current = maxSheetTranslate;
      return;
    }
    const boundedCurrent = clampSheetTranslate(
      sheetTranslateYValueRef.current,
      0,
      maxSheetTranslate
    );
    if (boundedCurrent !== sheetTranslateYValueRef.current) {
      sheetTranslateY.setValue(boundedCurrent);
      sheetTranslateYValueRef.current = boundedCurrent;
    }
  }, [
    clampSheetTranslate,
    isSheetCollapsed,
    maxSheetTranslate,
    selectedLocation,
    sheetTranslateY,
  ]);

  const animateSheetTo = useCallback(
    (toValue: number) => {
      const boundedTarget = clampSheetTranslate(toValue, 0, maxSheetTranslateRef.current);
      Animated.spring(sheetTranslateY, {
        toValue: boundedTarget,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
      }).start(({ finished }) => {
        if (finished) {
          setIsSheetCollapsed(boundedTarget > 0);
        }
      });
    },
    [clampSheetTranslate, sheetTranslateY]
  );

  const toggleSheetPosition = useCallback(() => {
    const maxTranslate = maxSheetTranslateRef.current;
    if (maxTranslate <= 0) return;
    const isCurrentlyCollapsed = sheetTranslateYValueRef.current > maxTranslate * 0.5;
    animateSheetTo(isCurrentlyCollapsed ? 0 : maxTranslate);
  }, [animateSheetTo]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          return Math.abs(gestureState.dy) > 4 && maxSheetTranslateRef.current > 0;
        },
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetDragStartRef.current = value;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const maxTranslate = maxSheetTranslateRef.current;
          const next = clampSheetTranslate(
            sheetDragStartRef.current + gestureState.dy,
            0,
            maxTranslate
          );
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const maxTranslate = maxSheetTranslateRef.current;
          if (maxTranslate <= 0) {
            animateSheetTo(0);
            return;
          }
          const current = clampSheetTranslate(sheetTranslateYValueRef.current, 0, maxTranslate);
          const shouldCollapse =
            gestureState.vy > 0.8 ||
            (gestureState.vy >= 0 && current > maxTranslate * 0.35);
          animateSheetTo(shouldCollapse ? maxTranslate : 0);
        },
        onPanResponderTerminate: () => {
          const maxTranslate = maxSheetTranslateRef.current;
          const current = clampSheetTranslate(sheetTranslateYValueRef.current, 0, maxTranslate);
          animateSheetTo(current > maxTranslate * 0.5 ? maxTranslate : 0);
        },
      }),
    [animateSheetTo, clampSheetTranslate, sheetTranslateY]
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (!isSearchFocused || query.length < 2) {
      setSearchSuggestions([]);
      setSearchLoading(false);
      setSearchError(null);
      searchAbortRef.current?.abort();
      return;
    }

    const requestId = (searchLookupId.current += 1);
    setSearchLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const mapSuggestions = (items: SearchSuggestion[]) =>
          items.filter(Boolean).slice(0, 5);

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
          if (Number.isFinite(proximityLat) && Number.isFinite(proximityLng)) {
            params.set("proximity", `${proximityLng},${proximityLat}`);
          }

          const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
            q
          )}.json?${params.toString()}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`Search failed (${response.status})`);
          }

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
              // Replace with your app name + contact for production use.
              "User-Agent": "RouteApp/1.0",
            },
          });

          if (!response.ok) {
            throw new Error(`Search failed (${response.status})`);
          }

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
                  const subtitle =
                    displayName && displayName !== title ? displayName : null;
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

        const buildVariants = (q: string) => {
          const variants: string[] = [q];
          const expandedHospital = q.replace(/\bhos(p)?$/i, "hospital");
          if (expandedHospital !== q) variants.push(expandedHospital);
          if (q.includes(" ")) {
            const trimmed = q.split(" ").slice(0, -1).join(" ").trim();
            if (trimmed && trimmed !== q) variants.push(trimmed);
          }
          return Array.from(new Set(variants));
        };

        const variants = buildVariants(query);
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
          // Final fallback to Nominatim if MapTiler returns nothing.
          for (const variant of variants) {
            suggestions = mapSuggestions(
              await fetchNominatimSuggestions(true, variant)
            );
            if (searchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;

            suggestions = mapSuggestions(
              await fetchNominatimSuggestions(false, variant)
            );
            if (searchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;
          }
        }

        setSearchSuggestions(suggestions);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (searchLookupId.current !== requestId) return;
        setSearchError("Unable to fetch suggestions.");
        setSearchSuggestions([]);
      } finally {
        if (searchLookupId.current === requestId) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isSearchFocused, maptilerKey, proximityLat, proximityLng, searchQuery]);

  useEffect(() => {
    const query = fromSearchQuery.trim();
    if (!isFromSearchFocused || query.length < 2) {
      setFromSearchSuggestions([]);
      setFromSearchLoading(false);
      setFromSearchError(null);
      fromSearchAbortRef.current?.abort();
      return;
    }

    const requestId = (fromSearchLookupId.current += 1);
    setFromSearchLoading(true);
    setFromSearchError(null);

    const controller = new AbortController();
    fromSearchAbortRef.current?.abort();
    fromSearchAbortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const mapSuggestions = (items: SearchSuggestion[]) =>
          items.filter(Boolean).slice(0, 5);

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
          if (Number.isFinite(proximityLat) && Number.isFinite(proximityLng)) {
            params.set("proximity", `${proximityLng},${proximityLat}`);
          }

          const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
            q
          )}.json?${params.toString()}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`Search failed (${response.status})`);
          }

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

          if (!response.ok) {
            throw new Error(`Search failed (${response.status})`);
          }

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
                  const subtitle =
                    displayName && displayName !== title ? displayName : null;
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

        const buildVariants = (q: string) => {
          const variants: string[] = [q];
          const expandedHospital = q.replace(/\bhos(p)?$/i, "hospital");
          if (expandedHospital !== q) variants.push(expandedHospital);
          if (q.includes(" ")) {
            const trimmed = q.split(" ").slice(0, -1).join(" ").trim();
            if (trimmed && trimmed !== q) variants.push(trimmed);
          }
          return Array.from(new Set(variants));
        };

        const variants = buildVariants(query);
        let suggestions: SearchSuggestion[] = [];

        for (const variant of variants) {
          suggestions = mapSuggestions(
            maptilerKey
              ? await fetchMapTilerSuggestions(true, variant)
              : await fetchNominatimSuggestions(true, variant)
          );
          if (fromSearchLookupId.current !== requestId) return;
          if (suggestions.length > 0) break;

          suggestions = mapSuggestions(
            maptilerKey
              ? await fetchMapTilerSuggestions(false, variant)
              : await fetchNominatimSuggestions(false, variant)
          );
          if (fromSearchLookupId.current !== requestId) return;
          if (suggestions.length > 0) break;
        }

        if (suggestions.length === 0 && maptilerKey) {
          for (const variant of variants) {
            suggestions = mapSuggestions(
              await fetchNominatimSuggestions(true, variant)
            );
            if (fromSearchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;

            suggestions = mapSuggestions(
              await fetchNominatimSuggestions(false, variant)
            );
            if (fromSearchLookupId.current !== requestId) return;
            if (suggestions.length > 0) break;
          }
        }

        setFromSearchSuggestions(suggestions);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (fromSearchLookupId.current !== requestId) return;
        setFromSearchError("Unable to fetch suggestions.");
        setFromSearchSuggestions([]);
      } finally {
        if (fromSearchLookupId.current === requestId) {
          setFromSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fromSearchQuery, isFromSearchFocused, maptilerKey, proximityLat, proximityLng]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      fromSearchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    let subscription: Location.LocationSubscription | null = null;

    const requestLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (isActive) setLocationError("Location permission denied.");
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isActive) {
          const firstFix = {
            lng: current.coords.longitude,
            lat: current.coords.latitude,
            zoom: USER_FOCUS_ZOOM,
          };
          setUserCenter(firstFix);
          setInitialCenter((prev) => prev ?? firstFix);
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 8000,
          },
          (update) => {
            if (!isActive) return;
            setUserCenter({
              lng: update.coords.longitude,
              lat: update.coords.latitude,
              zoom: USER_FOCUS_ZOOM,
            });
          }
        );
      } catch {
        if (isActive) setLocationError("Unable to fetch location.");
      }
    };

    requestLocation();

    return () => {
      isActive = false;
      subscription?.remove();
    };
  }, []);

  const lookupPlaceName = async (location: { lng: number; lat: number }) => {
    const requestId = (placeLookupId.current += 1);
    setSelectedPlaceLoading(true);
    setSelectedPlaceError(null);
    setSelectedPlaceTitle(null);
    setSelectedPlaceSubtitle(null);

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          // Replace with your app name + contact for production use.
          "User-Agent": "RouteApp/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Reverse geocode failed (${response.status})`);
      }

      const data = await response.json();
      if (placeLookupId.current !== requestId) return;

      const address = data?.address ?? {};
      const title =
        data?.name ||
        address?.amenity ||
        address?.tourism ||
        address?.building ||
        address?.shop ||
        address?.road ||
        "Selected place";
      const subtitle =
        data?.display_name ||
        [
          address?.road,
          address?.neighbourhood,
          address?.suburb,
          address?.city || address?.town || address?.village,
          address?.state,
        ]
          .filter(Boolean)
          .join(", ") ||
        null;

      setSelectedPlaceTitle(title);
      setSelectedPlaceSubtitle(subtitle);
    } catch {
      if (placeLookupId.current !== requestId) return;
      setSelectedPlaceError("Unable to fetch place name.");
    } finally {
      if (placeLookupId.current === requestId) {
        setSelectedPlaceLoading(false);
      }
    }
  };

  const clearTripPlan = () => {
    setTripPlanLoading(false);
    setTripPlanError(null);
    setTripPlan(null);
    setTripSegments([]);
  };

  const requestTripPlan = async () => {
    if (!selectedLocation) {
      setTripPlanError(t.selectDestination);
      return;
    }
    if (!effectiveFromLocation) {
      setTripPlanError(t.fromUnavailable);
      return;
    }
    if (!BACKEND_BASE_URL) {
      setTripPlanError("Set EXPO_PUBLIC_BACKEND_URL in .env.");
      return;
    }

    const baseUrl = resolveBackendBaseUrl();
    if (!baseUrl) {
      setTripPlanError("Backend URL is missing.");
      return;
    }
    const params = new URLSearchParams({
      fromLat: String(effectiveFromLocation.lat),
      fromLon: String(effectiveFromLocation.lng),
      toLat: String(selectedLocation.lat),
      toLon: String(selectedLocation.lng),
    });

    setTripPlanLoading(true);
    setTripPlanError(null);
    setTripPlan(null);
    setTripSegments([]);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(`${baseUrl}/v1/trips/plan?${params.toString()}`, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Trip planning failed (${response.status}).`);
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("Trip planner returned invalid response.");
      }
      if (payload.status === "no_route") {
        setTripPlanError(payload.message || "No direct route found.");
        return;
      }

      const itinerary = payload.itinerary as TripItinerary | undefined;
      if (!itinerary || !Array.isArray(itinerary.segments)) {
        throw new Error("Trip planner returned incomplete itinerary.");
      }

      const mapSegments: MapPolylineSegment[] = itinerary.segments
        .map((segment, index) => {
          const coordinates = Array.isArray(segment.geometry?.coordinates)
            ? segment.geometry.coordinates
                .map((pair) => ({
                  lng: Number(pair[0]),
                  lat: Number(pair[1]),
                }))
                .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
            : [];

          if (coordinates.length < 2) return null;
          return {
            id: `${segment.id}_${index}`,
            color: segment.color,
            width: segment.mode === "bus" ? 6 : 5,
            coordinates,
          } as MapPolylineSegment;
        })
        .filter(Boolean) as MapPolylineSegment[];

      setTripPlan(itinerary);
      setTripSegments(mapSegments);
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.toLowerCase().includes("aborted")) {
        setTripPlanError("Trip planning timed out. Please try again.");
      } else if (message.toLowerCase().includes("network request failed")) {
        setTripPlanError(
          `Cannot reach backend at ${baseUrl}. If using phone, set EXPO_PUBLIC_BACKEND_URL to http://<your-pc-lan-ip>:4000. Android emulator uses http://10.0.2.2:4000.`
        );
      } else {
        setTripPlanError(message || "Unable to plan this trip.");
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setTripPlanLoading(false);
    }
  };

  const handleSelectSuggestion = (item: SearchSuggestion) => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setSearchQuery(item.title);
    setSearchSuggestions([]);
    setSearchLoading(false);
    setSearchError(null);

    setSelectedLocation({ lng: item.lng, lat: item.lat });
    setSelectedPlaceTitle(item.title);
    setSelectedPlaceSubtitle(item.subtitle);
    setSelectedPlaceError(null);
    setSelectedPlaceLoading(false);
    setIsSheetCollapsed(false);
    animateSheetTo(0);
    clearTripPlan();

    mapRef.current?.panToLocation(item.lng, item.lat, USER_FOCUS_ZOOM);
  };

  const handleSelectFromSuggestion = (item: SearchSuggestion) => {
    Keyboard.dismiss();
    fromSearchInputRef.current?.blur();
    setFromSearchQuery(item.title);
    setFromSearchSuggestions([]);
    setFromSearchLoading(false);
    setFromSearchError(null);
    setCustomFromLocation({ lng: item.lng, lat: item.lat });
    setFromPlaceTitle(item.title);
    setFromPlaceSubtitle(item.subtitle);
    clearTripPlan();
    animateSheetTo(0);
    setIsSheetCollapsed(false);
    mapRef.current?.panToLocation(item.lng, item.lat, USER_FOCUS_ZOOM);
  };

  const handleUseYourLocationAsFrom = () => {
    setCustomFromLocation(null);
    setFromPlaceTitle(t.yourLocation);
    setFromPlaceSubtitle(null);
    setFromSearchQuery("");
    setFromSearchSuggestions([]);
    setFromSearchLoading(false);
    setFromSearchError(null);
    clearTripPlan();
    animateSheetTo(0);
    setIsSheetCollapsed(false);
    if (userCenter) {
      mapRef.current?.panToUser(userCenter.lng, userCenter.lat, USER_FOCUS_ZOOM);
    }
  };

  const handleDirectionsPress = () => {
    setShowFromSelector(true);
    animateSheetTo(0);
    setIsSheetCollapsed(false);
    if (effectiveFromLocation) {
      requestTripPlan();
    } else {
      setTripPlanError(t.chooseFromLocation);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Background map */}
      <View style={StyleSheet.absoluteFill}>
        <MapBackground
          ref={mapRef}
          initialCenter={initialCenter ?? undefined}
          mapId={mapId}
          userLocation={userCenter ? { lng: userCenter.lng, lat: userCenter.lat } : undefined}
          selectedLocation={selectedLocation}
          routeSegments={tripSegments}
          onMapPress={(location) => {
            setSelectedLocation(location);
            setSearchSuggestions([]);
            setSearchError(null);
            setSearchLoading(false);
            setIsSheetCollapsed(false);
            animateSheetTo(0);
            clearTripPlan();
            lookupPlaceName(location);
          }}
        />
      </View>

      {/* Your UI overlay */}
      <SafeAreaView edges={["top"]} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.searchWrap} pointerEvents="auto">
          <View style={[styles.searchBar, { backgroundColor: tc.searchBarBg, borderColor: tc.searchBarBorder }]}>
            <SearchIcon color="#26c485" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={tc.inputPlaceholder}
              style={[styles.searchInput, { color: tc.inputText }]}
              returnKeyType="search"
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery("");
                  setSearchSuggestions([]);
                  setSearchError(null);
                }}
                style={styles.clearButton}
                accessibilityLabel="Clear search"
              >
                <ClearIcon color={tc.clearIconColor} />
              </Pressable>
            )}
          </View>
          {isSearchFocused &&
          (searchLoading || searchError || searchQuery.trim().length >= 2) ? (
            <View style={[styles.suggestionsPanel, { backgroundColor: tc.suggestionsBg, borderColor: tc.suggestionsBorder }]}>
              {searchLoading ? (
                <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{t.searching}</Text>
              ) : searchError ? (
                <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{searchError}</Text>
              ) : searchQuery.trim().length >= 2 && searchSuggestions.length === 0 ? (
                <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{t.noResults}</Text>
              ) : (
                searchSuggestions.map((item, index) => (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelectSuggestion(item)}
                    style={({ pressed }) => [
                      styles.suggestionItem,
                      pressed ? { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" } : null,
                    ]}
                  >
                    <Text style={[styles.suggestionTitle, { color: tc.suggestionTitle }]}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={[styles.suggestionSubtitle, { color: tc.suggestionSubtitle }]}>{item.subtitle}</Text>
                    ) : null}
                    {index < searchSuggestions.length - 1 ? (
                      <View style={[styles.suggestionDivider, { backgroundColor: tc.suggestionDivider }]} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
          {locationError ? (
            <Text style={styles.searchHint}>{locationError}</Text>
          ) : null}
        </View>
      </SafeAreaView>

      <View style={styles.mapControls} pointerEvents="box-none">
        <View style={[styles.mapControlsFrame, { backgroundColor: tc.mapControlsBg, borderColor: tc.mapControlsBorder }]} pointerEvents="auto">
          <MapControlButton
            accessibilityLabel="Zoom in"
            onPress={() => mapRef.current?.zoomIn()}
            icon={<ZoomInIcon color={isDark ? "#ffffff" : "#1a1a1a"} />}
          />
          <View style={[styles.mapControlDivider, { backgroundColor: tc.mapControlsBorder }]} />
          <MapControlButton
            accessibilityLabel="Zoom out"
            onPress={() => mapRef.current?.zoomOut()}
            icon={<ZoomOutIcon color={isDark ? "#ffffff" : "#1a1a1a"} />}
          />
          <View style={[styles.mapControlDivider, { backgroundColor: tc.mapControlsBorder }]} />
          <MapControlButton
            accessibilityLabel="Pan to my location"
            onPress={() => {
              if (userCenter) {
                mapRef.current?.panToUser(
                  userCenter.lng,
                  userCenter.lat,
                  USER_FOCUS_ZOOM
                );
              }
            }}
            disabled={!userCenter}
            icon={<LocateIcon color={userCenter ? "#26c485" : "#9aa0a6"} />}
          />
        </View>
      </View>

      {selectedLocation ? (
        <SafeAreaView
          edges={[]}
          style={[styles.bottomCardContainer, { bottom: bottomCardBottomOffset }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.bottomCard,
              {
                transform: [{ translateY: sheetTranslateY }],
                backgroundColor: tc.cardBg,
                borderColor: tc.cardBorder,
              },
            ]}
            pointerEvents="auto"
            onLayout={(event) => {
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              if (nextHeight > 0 && nextHeight !== sheetHeight) {
                setSheetHeight(nextHeight);
              }
            }}
            {...sheetPanResponder.panHandlers}
          >
            <Pressable
              style={styles.bottomSheetHandleTouch}
              onPress={toggleSheetPosition}
              accessibilityRole="button"
              accessibilityLabel={
                isSheetCollapsed ? "Expand directions card" : "Collapse directions card"
              }
            >
              <View style={[styles.bottomSheetHandle, { backgroundColor: tc.sheetHandle }]} />
            </Pressable>

            <View style={styles.bottomCardHeader}>
              <Text style={[styles.bottomCardTitle, { color: tc.cardTitle }]}>
                {selectedPlaceTitle ?? "Selected Place"}
              </Text>
              <Pressable
                onPress={() => {
                  setSelectedLocation(null);
                  setSelectedPlaceTitle(null);
                  setSelectedPlaceSubtitle(null);
                  setSelectedPlaceError(null);
                  setSelectedPlaceLoading(false);
                  setShowFromSelector(false);
                  setIsFromSearchFocused(false);
                  setFromSearchQuery("");
                  setFromSearchSuggestions([]);
                  setFromSearchLoading(false);
                  setFromSearchError(null);
                  clearTripPlan();
                }}
                accessibilityRole="button"
                accessibilityLabel="Close selected place card"
                style={styles.closeButton}
              >
                <CloseIcon color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
            {selectedPlaceLoading ? (
              <Text style={[styles.bottomCardText, { color: tc.cardText }]}>{t.lookingUpPlace}</Text>
            ) : selectedPlaceError ? (
              <Text style={[styles.bottomCardText, { color: tc.cardText }]}>{selectedPlaceError}</Text>
            ) : selectedPlaceSubtitle ? (
              <Text style={[styles.bottomCardText, { color: tc.cardText }]}>{selectedPlaceSubtitle}</Text>
            ) : null}
            <Text style={[styles.bottomCardText, { color: tc.cardText }]}>
              Latitude: {selectedLocation.lat.toFixed(6)}
            </Text>
            <Text style={[styles.bottomCardText, { color: tc.cardText }]}>
              Longitude: {selectedLocation.lng.toFixed(6)}
            </Text>

            {showFromSelector ? (
              <View style={[styles.fromSelectorSection, { backgroundColor: tc.fromSelectorBg, borderColor: tc.fromSelectorBorder }]}>
                <Text style={[styles.fromSelectorTitle, { color: tc.fromSelectorLabel }]}>{t.from}</Text>
                <Text style={[styles.fromSelectorValue, { color: tc.fromSelectorValue }]}>{fromPlaceTitle}</Text>
                {fromPlaceSubtitle ? (
                  <Text style={[styles.fromSelectorSubtitle, { color: tc.fromSelectorSubtitle }]}>{fromPlaceSubtitle}</Text>
                ) : null}

                <View style={[styles.fromSearchBar, { backgroundColor: tc.fromSearchBg, borderColor: tc.fromSearchBorder }]}>
                  <SearchIcon color="#26c485" />
                  <TextInput
                    ref={fromSearchInputRef}
                    value={fromSearchQuery}
                    onChangeText={setFromSearchQuery}
                    placeholder={t.searchStartLocation}
                    placeholderTextColor={tc.inputPlaceholder}
                    style={[styles.fromSearchInput, { color: tc.inputText }]}
                    returnKeyType="search"
                    onFocus={() => setIsFromSearchFocused(true)}
                    onBlur={() => setIsFromSearchFocused(false)}
                  />
                </View>

                <Pressable
                  onPress={handleUseYourLocationAsFrom}
                  style={({ pressed }) => [
                    styles.yourLocationButton,
                    pressed ? { transform: [{ scale: 0.99 }] } : null,
                  ]}
                >
                  <Text style={styles.yourLocationButtonText}>{t.yourLocation}</Text>
                </Pressable>

                {isFromSearchFocused &&
                (fromSearchLoading || fromSearchError || fromSearchQuery.trim().length >= 2) ? (
                  <View style={[styles.fromSuggestionsPanel, { backgroundColor: tc.suggestionsBg, borderColor: tc.suggestionsBorder }]}>
                    {fromSearchLoading ? (
                      <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{t.searching}</Text>
                    ) : fromSearchError ? (
                      <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{fromSearchError}</Text>
                    ) : fromSearchQuery.trim().length >= 2 &&
                      fromSearchSuggestions.length === 0 ? (
                      <Text style={[styles.suggestionStatus, { color: tc.suggestionStatus }]}>{t.noResults}</Text>
                    ) : (
                      fromSearchSuggestions.map((item, index) => (
                        <Pressable
                          key={item.id}
                          onPress={() => handleSelectFromSuggestion(item)}
                          style={({ pressed }) => [
                            styles.suggestionItem,
                            pressed ? { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" } : null,
                          ]}
                        >
                          <Text style={[styles.suggestionTitle, { color: tc.suggestionTitle }]}>{item.title}</Text>
                          {item.subtitle ? (
                            <Text style={[styles.suggestionSubtitle, { color: tc.suggestionSubtitle }]}>{item.subtitle}</Text>
                          ) : null}
                          {index < fromSearchSuggestions.length - 1 ? (
                            <View style={[styles.suggestionDivider, { backgroundColor: tc.suggestionDivider }]} />
                          ) : null}
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.bottomCardActions}>
              <Pressable
                onPress={handleDirectionsPress}
                disabled={tripPlanLoading}
                style={({ pressed }) => [
                  styles.directionButton,
                  tripPlanLoading ? styles.directionButtonDisabled : null,
                  pressed && !tripPlanLoading
                    ? { transform: [{ scale: 0.98 }] }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Get bus directions"
              >
                <Text style={styles.directionButtonText}>
                  {tripPlanLoading ? t.planning : t.directions}
                </Text>
              </Pressable>
            </View>

            {tripPlanError ? (
              <Text style={styles.tripErrorText}>{tripPlanError}</Text>
            ) : null}

            {tripPlan ? (
              <View style={[styles.tripSummaryCard, { backgroundColor: tc.tripCardBg, borderColor: tc.tripCardBorder }]}>
                <View style={styles.tripSummaryHeader}>
                  <Text style={styles.tripSummaryRouteLabel}>🚌</Text>
                  <Text style={[styles.tripSummaryTitle, { color: tc.tripTitle }]}>
                    {tripPlan.route?.name ?? t.busRoute}
                  </Text>
                </View>
                <View style={styles.tripSummaryRow}>
                  <Text style={[styles.tripSummaryDot, { color: tc.tripDot }]}>●</Text>
                  <View>
                    <Text style={[styles.tripSummaryLabel, { color: tc.tripLabel }]}>{t.boardAt}</Text>
                    <Text style={[styles.tripSummaryValue, { color: tc.tripValue }]}>
                      {tripPlan.boardingPlatform?.name ?? tripPlan.boardingStation.name}
                    </Text>
                  </View>
                </View>
                <View style={styles.tripSummaryRow}>
                  <Text style={[styles.tripSummaryDot, { color: "#1FAE66" }]}>●</Text>
                  <View>
                    <Text style={[styles.tripSummaryLabel, { color: tc.tripLabel }]}>{t.getOffAt}</Text>
                    <Text style={[styles.tripSummaryValue, { color: tc.tripValue }]}>
                      {tripPlan.alightingPlatform?.name ?? tripPlan.alightingStation.name}
                    </Text>
                  </View>
                </View>
                <View style={[styles.tripSummaryFooter, { borderTopColor: tc.tripDivider }]}>
                  <Text style={[styles.tripSummaryMeta, { color: tc.tripMeta }]}>
                    🕐 {formatDuration(tripPlan.totals.totalDurationS)}
                  </Text>
                  <Text style={[styles.tripSummaryMetaDivider, { color: tc.tripDot }]}>·</Text>
                  <Text style={[styles.tripSummaryMeta, { color: tc.tripMeta }]}>
                    📍 {formatDistance(tripPlan.totals.totalDistanceM)}
                  </Text>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  searchWrap: {
    margin: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(20,20,20,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: "white",
    fontSize: 16,
    paddingVertical: 0,
  },
  suggestionsPanel: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(20,20,20,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionSubtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 2,
  },
  suggestionDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 8,
  },
  suggestionStatus: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  searchHint: {
    marginTop: 8,
    marginLeft: 6,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  bottomCardContainer: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  bottomCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(18,18,18,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  bottomSheetHandleTouch: {
    height: 20,
    marginTop: -4,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  bottomCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bottomCardTitle: {
    color: "white",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  bottomCardText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    marginTop: 3,
  },
  fromSelectorSection: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  fromSelectorTitle: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fromSelectorValue: {
    marginTop: 2,
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  fromSelectorSubtitle: {
    marginTop: 2,
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
  },
  fromSearchBar: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(20,20,20,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  fromSearchInput: {
    flex: 1,
    color: "white",
    fontSize: 14,
    paddingVertical: 0,
  },
  yourLocationButton: {
    marginTop: 8,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31,174,102,0.22)",
    borderWidth: 1,
    borderColor: "rgba(31,174,102,0.50)",
  },
  yourLocationButtonText: {
    color: "#7bf2bc",
    fontSize: 12,
    fontWeight: "700",
  },
  fromSuggestionsPanel: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  bottomCardActions: {
    marginTop: 10,
  },
  directionButton: {
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1FAE66",
  },
  directionButtonDisabled: {
    opacity: 0.55,
  },
  directionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  tripErrorText: {
    marginTop: 8,
    color: "#ff8a80",
    fontSize: 12,
  },
  tripSummaryCard: {
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderLeftWidth: 3,
    borderLeftColor: "#1FAE66",
  },
  tripSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  tripSummaryRouteLabel: {
    fontSize: 16,
  },
  tripSummaryTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  tripSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  tripSummaryDot: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    marginTop: 3,
  },
  tripSummaryLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tripSummaryValue: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  tripSummaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  tripSummaryMeta: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  tripSummaryMetaDivider: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
  },
  tripSummaryText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    marginTop: 2,
  },
  clearButton: {
    padding: 4,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapControls: {
    position: "absolute",
    right: 14,
    top: 160,
  },
  mapControlsFrame: {
    width: 56,
    borderRadius: 18,
    paddingVertical: 6,
    alignItems: "center",
    backgroundColor: "rgba(20,20,20,0.70)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mapControlDivider: {
    width: 30,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  mapControlButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mapControlButtonDisabled: {
    opacity: 0.5,
  },
});

type MapControlButtonProps = {
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
};

type SearchSuggestion = {
  id: string;
  title: string;
  subtitle: string | null;
  lat: number;
  lng: number;
};

type LineStringGeometry = {
  type: "LineString";
  coordinates: number[][];
};

type TripSegment = {
  id: string;
  mode: "walk" | "bus" | string;
  color: string;
  distanceM: number;
  durationS: number;
  geometry: LineStringGeometry;
};

type TripStop = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

type TripPlatform = {
  id: string;
  name: string;
  side: string;
  lat: number;
  lon: number;
};

type TripItinerary = {
  route: {
    id: string;
    name: string;
  };
  boardingStation: TripStop;
  boardingPlatform: TripPlatform | null;
  alightingStation: TripStop;
  alightingPlatform: TripPlatform | null;
  segments: TripSegment[];
  totals: {
    totalDistanceM: number;
    totalDurationS: number;
  };
};

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}

function formatDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function MapControlButton({
  accessibilityLabel,
  onPress,
  disabled,
  icon,
}: MapControlButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.mapControlButton,
        disabled ? styles.mapControlButtonDisabled : null,
        pressed && !disabled ? { transform: [{ scale: 0.96 }] } : null,
        pressed && !disabled ? { backgroundColor: "rgba(255,255,255,0.08)" } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
    </Pressable>
  );
}

function ZoomInIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="2" />
      <Line x1="20" y1="20" x2="16.5" y2="16.5" stroke={color} strokeWidth="2" />
      <Line x1="11" y1="8.5" x2="11" y2="13.5" stroke={color} strokeWidth="2" />
      <Line x1="8.5" y1="11" x2="13.5" y2="11" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

function ZoomOutIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="2" />
      <Line x1="20" y1="20" x2="16.5" y2="16.5" stroke={color} strokeWidth="2" />
      <Line x1="8.5" y1="11" x2="13.5" y2="11" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

function LocateIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="7.5" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="12" r="2.5" fill={color} />
      <Path
        d="M12 3.5V6.5M12 17.5V20.5M3.5 12H6.5M17.5 12H20.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="2" />
      <Line x1="20" y1="20" x2="16.5" y2="16.5" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

function ClearIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.15)" />
      <Line x1="8" y1="8" x2="16" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="16" y1="8" x2="8" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="20" y1="4" x2="4" y2="20" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}
