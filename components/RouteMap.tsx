import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

export type RouteMapCoordinate = {
  lng: number;
  lat: number;
};

export type RouteMapStop = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

type RouteMapProps = {
  routeCoordinates: RouteMapCoordinate[];
  stops: RouteMapStop[];
  onMapPress?: (location: RouteMapCoordinate) => void;
  mapId?: string;
  focusLocation?: RouteMapCoordinate | null;
  focusZoom?: number;
};

const DEFAULT_CENTER = { lng: 85.324, lat: 27.7172, zoom: 12 };

export default function RouteMap({
  routeCoordinates,
  stops,
  onMapPress,
  mapId = "openstreetmap",
  focusLocation = null,
  focusZoom = 15,
}: RouteMapProps) {
  const maptilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  const webViewRef = useRef<WebView>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const initialCenter = useMemo(() => {
    if (routeCoordinates.length > 0) {
      const first = routeCoordinates[0];
      return { lng: first.lng, lat: first.lat, zoom: 13 };
    }
    if (stops.length > 0) {
      const firstStop = stops[0];
      return { lng: firstStop.lon, lat: firstStop.lat, zoom: 13 };
    }
    return DEFAULT_CENTER;
  }, [routeCoordinates, stops]);

  const html = useMemo(() => {
    const styleUrl = `https://api.maptiler.com/maps/${mapId}/style.json?key=${maptilerKey}`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; }
    #map { position:absolute; inset:0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const map = new maplibregl.Map({
      container: "map",
      style: "${styleUrl}",
      center: [${initialCenter.lng}, ${initialCenter.lat}],
      zoom: ${initialCenter.zoom ?? 12},
      attributionControl: false,
    });

    const routeSourceId = "route-line-source";
    const routeLayerId = "route-line-layer";
    const routeArrowLayerId = "route-arrow-layer";
    let stopMarkers = [];
    let pressedMarker = null;

    const clearStops = () => {
      stopMarkers.forEach((marker) => marker.remove());
      stopMarkers = [];
    };

    const clearRouteLayer = () => {
      if (map.getLayer(routeArrowLayerId)) map.removeLayer(routeArrowLayerId);
      if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
      if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);
    };

    const setPressedMarker = (lng, lat) => {
      if (!pressedMarker) {
        pressedMarker = new maplibregl.Marker({ color: "#ef4444" }).setLngLat([lng, lat]).addTo(map);
      } else {
        pressedMarker.setLngLat([lng, lat]);
      }
    };

    window.panToLocation = (lng, lat, zoom) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      setPressedMarker(lng, lat);
      map.flyTo({
        center: [lng, lat],
        zoom: Number.isFinite(zoom) ? Number(zoom) : 15,
        speed: 1,
        curve: 1.2,
        essential: true,
      });
    };

    window.setRouteData = (rawPayload) => {
      let payload = null;
      try {
        payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
      } catch {
        payload = null;
      }
      if (!payload || typeof payload !== "object") return;

      const coords = Array.isArray(payload.routeCoordinates)
        ? payload.routeCoordinates
            .map((point) => [Number(point.lng), Number(point.lat)])
            .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
        : [];
      const stops = Array.isArray(payload.stops) ? payload.stops : [];

      clearRouteLayer();
      clearStops();

      if (coords.length >= 2) {
        map.addSource(routeSourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          },
        });

        map.addLayer({
          id: routeLayerId,
          type: "line",
          source: routeSourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#1FAE66",
            "line-width": 6,
            "line-opacity": 0.95,
          },
        });

        map.addLayer({
          id: routeArrowLayerId,
          type: "symbol",
          source: routeSourceId,
          layout: {
            "symbol-placement": "line",
            "text-field": ">",
            "text-size": 11,
            "symbol-spacing": 120,
            "text-keep-upright": false,
            "text-rotation-alignment": "map",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.4)",
            "text-halo-width": 1.2,
          },
        });

        const bounds = coords.reduce(
          (acc, pair) => acc.extend(pair),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 40, duration: 500 });
      }

      stops.forEach((stop, index) => {
        const lat = Number(stop.lat);
        const lon = Number(stop.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const dot = document.createElement("div");
        dot.style.width = "12px";
        dot.style.height = "12px";
        dot.style.borderRadius = "50%";
        dot.style.background = "#2563eb";
        dot.style.border = "2px solid #fff";
        dot.style.boxShadow = "0 0 6px rgba(0,0,0,0.45)";

        const popupText =
          String(index + 1) +
          ". " +
          String(stop.name || "Stop") +
          "\\nLat: " +
          String(lat) +
          "\\nLon: " +
          String(lon);

        const marker = new maplibregl.Marker({ element: dot })
          .setLngLat([lon, lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setText(popupText))
          .addTo(map);
        stopMarkers.push(marker);
      });
    };

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      setPressedMarker(lng, lat);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "map-click", lng, lat }));
      }
    });

    map.once("load", () => {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage("map-ready");
      }
    });
  </script>
</body>
</html>`;
  }, [initialCenter.lat, initialCenter.lng, initialCenter.zoom, mapId, maptilerKey]);

  useEffect(() => {
    setIsMapReady(false);
  }, [html]);

  useEffect(() => {
    if (!isMapReady || !maptilerKey) return;
    const payload = JSON.stringify({
      routeCoordinates,
      stops,
    });
    webViewRef.current?.injectJavaScript(
      `window.setRouteData && window.setRouteData(${JSON.stringify(payload)}); true;`
    );
  }, [isMapReady, maptilerKey, routeCoordinates, stops]);

  useEffect(() => {
    if (!isMapReady || !focusLocation) return;
    const lng = Number(focusLocation.lng);
    const lat = Number(focusLocation.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    webViewRef.current?.injectJavaScript(
      `window.panToLocation && window.panToLocation(${lng}, ${lat}, ${Number(focusZoom)}); true;`
    );
  }, [focusLocation, focusZoom, isMapReady]);

  if (!maptilerKey) {
    return <WebView source={{ html: "<html><body style='background:#0b0b0b;'></body></html>" }} />;
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
      style={{ backgroundColor: "transparent" }}
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
    />
  );
}

