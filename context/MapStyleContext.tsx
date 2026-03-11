import React, { createContext, useContext, useMemo, useState } from 'react';

export type MapStyle = 'default' | 'satellite';

type MapStyleContextType = {
  mapStyle: MapStyle;
  mapId: string;
  isSatellite: boolean;
  setMapStyle: (style: MapStyle) => void;
  toggleMapStyle: () => void;
};

const MAP_ID_BY_STYLE: Record<MapStyle, string> = {
  default: 'openstreetmap',
  satellite: 'satellite',
};

const MapStyleContext = createContext<MapStyleContextType>({
  mapStyle: 'default',
  mapId: MAP_ID_BY_STYLE.default,
  isSatellite: false,
  setMapStyle: () => {},
  toggleMapStyle: () => {},
});

export function MapStyleProvider({ children }: { children: React.ReactNode }) {
  const [mapStyle, setMapStyle] = useState<MapStyle>('default');

  const value = useMemo(
    () => ({
      mapStyle,
      mapId: MAP_ID_BY_STYLE[mapStyle],
      isSatellite: mapStyle === 'satellite',
      setMapStyle,
      toggleMapStyle: () =>
        setMapStyle((prev) => (prev === 'satellite' ? 'default' : 'satellite')),
    }),
    [mapStyle]
  );

  return <MapStyleContext.Provider value={value}>{children}</MapStyleContext.Provider>;
}

export function useMapStyle() {
  return useContext(MapStyleContext);
}

