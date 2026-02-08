import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Keyboard } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapBackground, { MapBackgroundHandle } from "../../components/MapBackground";

export default function HomeScreen() {
  const USER_FOCUS_ZOOM = 15;
  const NEPAL_VIEWBOX_NOMINATIM = "80.058,30.447,88.201,26.347";
  const NEPAL_BBOX_MAPTILER = "80.058,26.347,88.201,30.447";
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
          if (userCenter) {
            params.set("proximity", `${userCenter.lng},${userCenter.lat}`);
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
  }, [isSearchFocused, maptilerKey, searchQuery, userCenter?.lat, userCenter?.lng]);

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
      } catch (err) {
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
    } catch (err) {
      if (placeLookupId.current !== requestId) return;
      setSelectedPlaceError("Unable to fetch place name.");
    } finally {
      if (placeLookupId.current === requestId) {
        setSelectedPlaceLoading(false);
      }
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
          onMapPress={(location) => {
            setSelectedLocation(location);
            setSearchSuggestions([]);
            setSearchError(null);
            setSearchLoading(false);
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
                }}
                accessibilityRole="button"
                accessibilityLabel="Close selected place card"
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>
            {selectedPlaceLoading ? (
              <Text style={styles.bottomCardText}>Looking up place…</Text>
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
