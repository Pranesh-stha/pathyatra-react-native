import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Keyboard, Platform } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapBackground, {
  MapBackgroundHandle,
  MapPolylineSegment,
} from "../../components/MapBackground";

export default function HomeScreen() {
  const USER_FOCUS_ZOOM = 15;
  const NEPAL_VIEWBOX_NOMINATIM = "80.058,30.447,88.201,26.347";
  const NEPAL_BBOX_MAPTILER = "80.058,26.347,88.201,30.447";
  const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
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
  const proximityLat = userCenter?.lat;
  const proximityLng = userCenter?.lng;

  const resolveBackendBaseUrl = () => {
    if (!BACKEND_BASE_URL) return null;
    const baseUrl = BACKEND_BASE_URL.replace(/\/+$/, "");
    if (Platform.OS !== "android") return baseUrl;
    // Android emulator cannot reach host machine via localhost.
    return baseUrl
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  };

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
      setTripPlanError("Select a destination first.");
      return;
    }
    if (!userCenter) {
      setTripPlanError("Current location unavailable.");
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
      fromLat: String(userCenter.lat),
      fromLon: String(userCenter.lng),
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
    clearTripPlan();

    mapRef.current?.panToLocation(item.lng, item.lat, USER_FOCUS_ZOOM);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Background map */}
      <View style={StyleSheet.absoluteFill}>
        <MapBackground
          ref={mapRef}
          initialCenter={initialCenter ?? undefined}
          userLocation={userCenter ? { lng: userCenter.lng, lat: userCenter.lat } : undefined}
          selectedLocation={selectedLocation}
          routeSegments={tripSegments}
          onMapPress={(location) => {
            setSelectedLocation(location);
            setSearchSuggestions([]);
            setSearchError(null);
            setSearchLoading(false);
            clearTripPlan();
            lookupPlaceName(location);
          }}
        />
      </View>

      {/* Your UI overlay */}
      <SafeAreaView edges={["top"]} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.searchWrap} pointerEvents="auto">
          <View style={styles.searchBar}>
            <SearchIcon color="#26c485" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search places, hotels, landmarks"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.searchInput}
              returnKeyType="search"
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </View>
          {isSearchFocused &&
          (searchLoading || searchError || searchQuery.trim().length >= 2) ? (
            <View style={styles.suggestionsPanel}>
              {searchLoading ? (
                <Text style={styles.suggestionStatus}>Searching...</Text>
              ) : searchError ? (
                <Text style={styles.suggestionStatus}>{searchError}</Text>
              ) : searchQuery.trim().length >= 2 && searchSuggestions.length === 0 ? (
                <Text style={styles.suggestionStatus}>No results found.</Text>
              ) : (
                searchSuggestions.map((item, index) => (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelectSuggestion(item)}
                    style={({ pressed }) => [
                      styles.suggestionItem,
                      pressed ? { backgroundColor: "rgba(255,255,255,0.05)" } : null,
                    ]}
                  >
                    <Text style={styles.suggestionTitle}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text>
                    ) : null}
                    {index < searchSuggestions.length - 1 ? (
                      <View style={styles.suggestionDivider} />
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
        <View style={styles.mapControlsFrame} pointerEvents="auto">
          <MapControlButton
            accessibilityLabel="Zoom in"
            onPress={() => mapRef.current?.zoomIn()}
            icon={<ZoomInIcon color="#ffffff" />}
          />
          <View style={styles.mapControlDivider} />
          <MapControlButton
            accessibilityLabel="Zoom out"
            onPress={() => mapRef.current?.zoomOut()}
            icon={<ZoomOutIcon color="#ffffff" />}
          />
          <View style={styles.mapControlDivider} />
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
        <SafeAreaView edges={["bottom"]} style={styles.bottomCardContainer} pointerEvents="box-none">
          <View style={styles.bottomCard} pointerEvents="auto">
            <View style={styles.bottomCardHeader}>
              <Text style={styles.bottomCardTitle}>
                {selectedPlaceTitle ?? "Selected Place"}
              </Text>
              <Pressable
                onPress={() => {
                  setSelectedLocation(null);
                  setSelectedPlaceTitle(null);
                  setSelectedPlaceSubtitle(null);
                  setSelectedPlaceError(null);
                  setSelectedPlaceLoading(false);
                  clearTripPlan();
                }}
                accessibilityRole="button"
                accessibilityLabel="Close selected place card"
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>x</Text>
              </Pressable>
            </View>
            {selectedPlaceLoading ? (
              <Text style={styles.bottomCardText}>Looking up place...</Text>
            ) : selectedPlaceError ? (
              <Text style={styles.bottomCardText}>{selectedPlaceError}</Text>
            ) : selectedPlaceSubtitle ? (
              <Text style={styles.bottomCardText}>{selectedPlaceSubtitle}</Text>
            ) : null}
            <Text style={styles.bottomCardText}>
              Latitude: {selectedLocation.lat.toFixed(6)}
            </Text>
            <Text style={styles.bottomCardText}>
              Longitude: {selectedLocation.lng.toFixed(6)}
            </Text>

            <View style={styles.bottomCardActions}>
              <Pressable
                onPress={requestTripPlan}
                disabled={tripPlanLoading || !userCenter}
                style={({ pressed }) => [
                  styles.directionButton,
                  tripPlanLoading || !userCenter ? styles.directionButtonDisabled : null,
                  pressed && !(tripPlanLoading || !userCenter)
                    ? { transform: [{ scale: 0.98 }] }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Get bus directions"
              >
                <Text style={styles.directionButtonText}>
                  {tripPlanLoading ? "Planning..." : "Directions"}
                </Text>
              </Pressable>
            </View>

            {tripPlanError ? (
              <Text style={styles.tripErrorText}>{tripPlanError}</Text>
            ) : null}

            {tripPlan ? (
              <View style={styles.tripSummaryCard}>
                <Text style={styles.tripSummaryTitle}>
                  {tripPlan.route?.name ?? "Bus Route"}
                </Text>
                <Text style={styles.tripSummaryText}>
                  Board: {tripPlan.boardingPlatform?.name ?? tripPlan.boardingStation.name}
                </Text>
                <Text style={styles.tripSummaryText}>
                  Get off: {tripPlan.alightingPlatform?.name ?? tripPlan.alightingStation.name}
                </Text>
                <Text style={styles.tripSummaryText}>
                  ETA {formatDuration(tripPlan.totals.totalDurationS)} | Distance{" "}
                  {formatDistance(tripPlan.totals.totalDistanceM)}
                </Text>
              </View>
            ) : null}
          </View>
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
    bottom: 80,
  },
  bottomCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(20,20,20,0.85)",
  },
  bottomCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bottomCardTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  bottomCardText: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
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
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tripSummaryTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  tripSummaryText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "white",
    fontSize: 18,
    lineHeight: 18,
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
