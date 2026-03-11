import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

export type MapBackgroundHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  panToUser: (lng: number, lat: number, zoom?: number) => void;
  panToLocation: (lng: number, lat: number, zoom?: number) => void;
};

export type MapPolylineSegment = {
  id: string;
  color: string;
  width?: number;
  coordinates: { lng: number; lat: number }[];
};

type Props = {
  // Optional: start somewhere (Kathmandu default-ish)
  initialCenter?: { lng: number; lat: number; zoom?: number };
  userLocation?: { lng: number; lat: number };
  selectedLocation?: { lng: number; lat: number } | null;
  fromLocation?: { lng: number; lat: number } | null;
  routeSegments?: MapPolylineSegment[];
  onMapPress?: (location: { lng: number; lat: number }) => void;
  mapId?: string; // e.g. "streets-v2", "outdoor-v2", etc.
};

const MapBackground = forwardRef<MapBackgroundHandle, Props>(function MapBackground(
  {
    initialCenter = { lng: 85.324, lat: 27.7172, zoom: 12 },
    userLocation,
    selectedLocation = null,
    fromLocation = null,
    routeSegments = [],
    onMapPress,
    mapId = "openstreetmap",
  },
  ref
) {
  const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  const webViewRef = useRef<WebView>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const inject = useCallback((script: string) => {
    if (!key || !isMapReady) return;
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, [isMapReady, key]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => inject("window.mapZoomIn && window.mapZoomIn()"),
      zoomOut: () => inject("window.mapZoomOut && window.mapZoomOut()"),
      panToUser: (lng, lat, zoom) =>
        inject(
          `window.panToUserLocation && window.panToUserLocation(${lng}, ${lat}, ${zoom ?? "null"})`
        ),
      panToLocation: (lng, lat, zoom) =>
        inject(
          `window.panToLocation && window.panToLocation(${lng}, ${lat}, ${zoom ?? "null"})`
        ),
    }),
    [inject]
  );

  const html = useMemo(() => {
    const styleUrl = `https://api.maptiler.com/maps/${mapId}/style.json?key=${key}`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; }
    #map { position:absolute; inset:0; }
    /* Optional: make it look more like a background */
    .veil {
      position:absolute; inset:0;
      background: rgba(0,0,0,0.18);
      pointer-events:none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="veil"></div>

  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const map = new maplibregl.Map({
      container: "map",
      style: "${styleUrl}",
      center: [${initialCenter.lng}, ${initialCenter.lat}],
      zoom: ${initialCenter.zoom ?? 12},
      attributionControl: false,
    });

    let userMarker = null;
    let selectedMarker = null;
    let routeLayerIds = [];
    let routeSourceIds = [];
    const getUserMarker = () => {
      if (userMarker) return userMarker;
      const userDot = document.createElement("div");
      userDot.style.width = "14px";
      userDot.style.height = "14px";
      userDot.style.borderRadius = "50%";
      userDot.style.background = "#26c485";
      userDot.style.border = "2px solid #000";
      userDot.style.boxShadow = "0 0 8px rgba(0,0,0,0.35)";
      userMarker = new maplibregl.Marker({ element: userDot })
        .setLngLat([${initialCenter.lng}, ${initialCenter.lat}])
        .addTo(map);
      return userMarker;
    };

    const getSelectedMarker = () => {
      if (selectedMarker) return selectedMarker;
      selectedMarker = new maplibregl.Marker({ color: "#e53935" })
        .setLngLat([${initialCenter.lng}, ${initialCenter.lat}])
        .addTo(map);
      return selectedMarker;
    };

    window.setUserLocation = (lng, lat) => {
      const marker = getUserMarker();
      marker.setLngLat([lng, lat]);
      map.easeTo({ center: [lng, lat], duration: 600 });
    };

    window.setSelectedLocation = (lng, lat) => {
      const marker = getSelectedMarker();
      marker.setLngLat([lng, lat]);
    };

    window.clearSelectedLocation = () => {
      if (selectedMarker) {
        selectedMarker.remove();
        selectedMarker = null;
      }
    };

    let fromMarker = null;
    const getFromMarker = () => {
      if (fromMarker) return fromMarker;
      const fromDot = document.createElement("div");
      fromDot.style.width = "16px";
      fromDot.style.height = "16px";
      fromDot.style.borderRadius = "50%";
      fromDot.style.background = "#2D7FF9";
      fromDot.style.border = "3px solid #fff";
      fromDot.style.boxShadow = "0 0 8px rgba(0,0,0,0.4)";
      fromMarker = new maplibregl.Marker({ element: fromDot })
        .setLngLat([${initialCenter.lng}, ${initialCenter.lat}])
        .addTo(map);
      return fromMarker;
    };

    window.setFromLocation = (lng, lat) => {
      const marker = getFromMarker();
      marker.setLngLat([lng, lat]);
    };

    window.clearFromLocation = () => {
      if (fromMarker) {
        fromMarker.remove();
        fromMarker = null;
      }
    };

    const clearRoutes = () => {
      routeLayerIds.forEach((id) => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });
      routeSourceIds.forEach((id) => {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      });
      routeLayerIds = [];
      routeSourceIds = [];
    };

    window.setRouteSegments = (rawSegments) => {
      let segments = [];
      try {
        segments = typeof rawSegments === "string" ? JSON.parse(rawSegments) : rawSegments;
      } catch (e) {
        segments = [];
      }

      if (!Array.isArray(segments)) {
        clearRoutes();
        return;
      }

      if (!map.isStyleLoaded()) {
        map.once("load", () => window.setRouteSegments(rawSegments));
        return;
      }

      clearRoutes();
      segments.forEach((segment, index) => {
        if (!segment || !Array.isArray(segment.coordinates)) return;
        const coordinates = segment.coordinates
          .map((point) => [Number(point.lng), Number(point.lat)])
          .filter(
            (point) =>
              Array.isArray(point) &&
              point.length === 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1])
          );
        if (coordinates.length < 2) return;

        const sourceId = "route-source-" + index;
        const layerId = "route-layer-" + index;
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": segment.color || "#2D7FF9",
            "line-width": Number(segment.width) || 5,
            "line-opacity": 0.94,
          },
        });

        const arrowLayerId = "route-arrow-" + index;
        map.addLayer({
          id: arrowLayerId,
          type: "symbol",
          source: sourceId,
          layout: {
            "symbol-placement": "line",
            "text-field": "▶",
            "text-size": 13,
            "symbol-spacing": 90,
            "text-keep-upright": false,
            "text-rotation-alignment": "map",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.35)",
            "text-halo-width": 1.5,
          },
        });

        routeSourceIds.push(sourceId);
        routeLayerIds.push(layerId);
        routeLayerIds.push(arrowLayerId);
      });
    };

    window.clearRouteSegments = () => {
      clearRoutes();
    };

    window.mapZoomIn = () => map.zoomIn({ duration: 250 });
    window.mapZoomOut = () => map.zoomOut({ duration: 250 });
    const panToLocation = (lng, lat, zoom) => {
      if (typeof zoom === "number") {
        map.easeTo({ center: [lng, lat], zoom, duration: 600 });
        return;
      }
      map.easeTo({ center: [lng, lat], duration: 600 });
    };
    window.panToLocation = panToLocation;
    window.panToUserLocation = panToLocation;
    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      window.setSelectedLocation(lng, lat);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "map-click", lng, lat })
        );
      }
    });

    map.once("load", () => {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage("map-ready");
      }
    });


    // Reduce accidental gestures if it's just a background
    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
  </script>
</body>
</html>`;
  }, [initialCenter.lat, initialCenter.lng, initialCenter.zoom, key, mapId]);

  useEffect(() => {
    setIsMapReady(false);
  }, [html]);

  useEffect(() => {
    const userLat = userLocation?.lat;
    const userLng = userLocation?.lng;
    if (!key || !isMapReady) return;
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return;
    webViewRef.current?.injectJavaScript(
      `window.setUserLocation && window.setUserLocation(${userLng}, ${userLat}); true;`
    );
  }, [isMapReady, key, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    const selectedLat = selectedLocation?.lat;
    const selectedLng = selectedLocation?.lng;
    if (!key || !isMapReady) return;
    if (!Number.isFinite(selectedLat) || !Number.isFinite(selectedLng)) {
      webViewRef.current?.injectJavaScript(
        "window.clearSelectedLocation && window.clearSelectedLocation(); true;"
      );
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.setSelectedLocation && window.setSelectedLocation(${selectedLng}, ${selectedLat}); true;`
    );
  }, [isMapReady, key, selectedLocation?.lat, selectedLocation?.lng]);

  useEffect(() => {
    const fromLat = fromLocation?.lat;
    const fromLng = fromLocation?.lng;
    if (!key || !isMapReady) return;
    if (!Number.isFinite(fromLat) || !Number.isFinite(fromLng)) {
      webViewRef.current?.injectJavaScript(
        "window.clearFromLocation && window.clearFromLocation(); true;"
      );
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.setFromLocation && window.setFromLocation(${fromLng}, ${fromLat}); true;`
    );
  }, [isMapReady, key, fromLocation?.lat, fromLocation?.lng]);

  useEffect(() => {
    if (!key || !isMapReady) return;
    const payload = JSON.stringify(routeSegments ?? []);
    webViewRef.current?.injectJavaScript(
      `window.setRouteSegments && window.setRouteSegments(${JSON.stringify(payload)}); true;`
    );
  }, [isMapReady, key, routeSegments]);

  if (!key) {
    // Render a blank map area if key isn't set yet (avoids crash)
    return (
      <WebView
        source={{ html: "<html><body style='background:#000;'></body></html>" }}
      />
    );
  }

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={() => setIsMapReady(true)}
      onMessage={(event) => {
        if (event.nativeEvent.data === "map-ready") {
          setIsMapReady(true);
          return;
        }
        if (!onMapPress) return;
        try {
          const payload = JSON.parse(event.nativeEvent.data);
          if (
            payload &&
            payload.type === "map-click" &&
            typeof payload.lng === "number" &&
            typeof payload.lat === "number"
          ) {
            onMapPress({ lng: payload.lng, lat: payload.lat });
          }
        } catch {
          // ignore non-JSON messages
        }
      }}
      // Makes it sit nicely behind your UI
      style={{ backgroundColor: "transparent" }}
      // Android needs this sometimes
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
    />
  );
});

export default MapBackground;
