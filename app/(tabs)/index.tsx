import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapBackground, { MapBackgroundHandle } from "../../components/MapBackground";

export default function HomeScreen() {
  const USER_FOCUS_ZOOM = 15;
  const mapRef = useRef<MapBackgroundHandle>(null);
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
            lookupPlaceName(location);
          }}
        />
      </View>

      {/* Your UI overlay */}
      <SafeAreaView edges={["top"]} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.card} pointerEvents="auto">
          <Text style={styles.title}>Home Pranesh</Text>
          <Text style={styles.sub}>Your content sits on top of the map.</Text>
          {locationError ? (
            <Text style={styles.sub}>{locationError}</Text>
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
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(20,20,20,0.70)",
  },
  title: { color: "white", fontSize: 22, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.8)", marginTop: 6 },
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
