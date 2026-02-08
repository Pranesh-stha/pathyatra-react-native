import React, { useMemo } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

type Props = {
  // Optional: start somewhere (Kathmandu default-ish)
  initialCenter?: { lng: number; lat: number; zoom?: number };
  mapId?: string; // e.g. "streets-v2", "outdoor-v2", etc.
};

export default function MapBackground({
  initialCenter = { lng: 85.324, lat: 27.7172, zoom: 12 },
  mapId = "streets-v2",
}: Props) {
  const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;

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



    // Reduce accidental gestures if it's just a background
    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
  </script>
</body>
</html>`;
  }, [initialCenter.lat, initialCenter.lng, initialCenter.zoom, key, mapId]);

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
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      // Makes it sit nicely behind your UI
      style={{ backgroundColor: "transparent" }}
      // Android needs this sometimes
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
    />
  );
}
