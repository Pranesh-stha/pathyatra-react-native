import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pathyatra_mapStyle';

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
  const [mapStyle, setMapStyleState] = useState<MapStyle>('default');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'default' || value === 'satellite') setMapStyleState(value);
    });
  }, []);

  const setMapStyle = (style: MapStyle) => {
    setMapStyleState(style);
    AsyncStorage.setItem(STORAGE_KEY, style);
  };

  const value = useMemo(
    () => ({
      mapStyle,
      mapId: MAP_ID_BY_STYLE[mapStyle],
      isSatellite: mapStyle === 'satellite',
      setMapStyle,
      toggleMapStyle: () =>
        setMapStyle(mapStyle === 'satellite' ? 'default' : 'satellite'),
    }),
    [mapStyle]
  );

  return <MapStyleContext.Provider value={value}>{children}</MapStyleContext.Provider>;
}

export function useMapStyle() {
  return useContext(MapStyleContext);
}
