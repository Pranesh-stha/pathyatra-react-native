import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pathyatra_language';

export type Language = 'en' | 'ne';

type Translations = {
  // Tab bar
  home: string;
  routes: string;
  settings: string;

  // Settings screen
  settingsTitle: string;
  darkMode: string;
  switchToLight: string;
  switchToDark: string;
  language: string;
  chooseLanguage: string;
  appInfo: string;
  version: string;
  feedback: string;
  feedbackSubtitle: string;

  // Home screen
  searchPlaceholder: string;
  searching: string;
  noResults: string;
  lookingUpPlace: string;
  from: string;
  searchStartLocation: string;
  yourLocation: string;
  boardAt: string;
  getOffAt: string;
  planning: string;
  directions: string;
  busRoute: string;
  selectDestination: string;
  fromUnavailable: string;
  chooseFromLocation: string;

  // Routes screen
  allBusRoutes: string;
  reload: string;
  searchRouteName: string;
  loadingRoutes: string;
  noMatchingRoutes: string;
  back: string;
  routeDetail: string;
  loadingRouteMap: string;
  searchAreaPanMap: string;
  tappedPoint: string;
  copyLonLat: string;
  copied: string;
  routeShapeUnavailable: string;

  // Nearby stops
  nearbyStops: string;
  noNearbyStops: string;
};

const en: Translations = {
  home: 'Home',
  routes: 'Routes',
  settings: 'Settings',

  settingsTitle: 'Settings',
  darkMode: 'Dark Mode',
  switchToLight: 'Switch to light theme',
  switchToDark: 'Switch to dark theme',
  language: 'Language',
  chooseLanguage: 'Choose your preferred language',
  appInfo: 'App Info',
  version: 'Version 1.0.0',
  feedback: 'Feedback',
  feedbackSubtitle: 'Share your thoughts with us',

  searchPlaceholder: 'Search places, hotels, landmarks',
  searching: 'Searching...',
  noResults: 'No results found.',
  lookingUpPlace: 'Looking up place...',
  from: 'From',
  searchStartLocation: 'Search starting location',
  yourLocation: 'Your location',
  boardAt: 'Board at',
  getOffAt: 'Get off at',
  planning: 'Planning...',
  directions: 'Directions',
  busRoute: 'Bus Route',
  selectDestination: 'Select a destination first.',
  fromUnavailable: 'From location unavailable. Choose a start point.',
  chooseFromLocation: 'Choose a from location or tap Your location.',

  allBusRoutes: 'All Bus Routes',
  reload: 'Reload',
  searchRouteName: 'Search route name',
  loadingRoutes: 'Loading routes...',
  noMatchingRoutes: 'No matching routes found.',
  back: 'Back',
  routeDetail: 'Route Detail',
  loadingRouteMap: 'Loading route map...',
  searchAreaPanMap: 'Search area to pan map',
  tappedPoint: 'Tapped Point',
  copyLonLat: 'Copy lon/lat',
  copied: 'Copied',
  routeShapeUnavailable: 'Exact road path is temporarily unavailable for this variant.',

  nearbyStops: 'Nearby Stops',
  noNearbyStops: 'No nearby stops found.',
};

const ne: Translations = {
  home: 'गृह',
  routes: 'मार्गहरू',
  settings: 'सेटिङ्स',

  settingsTitle: 'सेटिङ्स',
  darkMode: 'डार्क मोड',
  switchToLight: 'लाइट थिममा स्विच गर्नुहोस्',
  switchToDark: 'डार्क थिममा स्विच गर्नुहोस्',
  language: 'भाषा',
  chooseLanguage: 'आफ्नो मनपर्ने भाषा छान्नुहोस्',
  appInfo: 'एप जानकारी',
  version: 'संस्करण १.०.०',
  feedback: 'प्रतिक्रिया',
  feedbackSubtitle: 'हामीसँग आफ्नो विचार साझा गर्नुहोस्',

  searchPlaceholder: 'ठाउँहरू, होटलहरू, ल्यान्डमार्कहरू खोज्नुहोस्',
  searching: 'खोज्दै...',
  noResults: 'कुनै परिणाम भेटिएन।',
  lookingUpPlace: 'ठाउँ खोज्दै...',
  from: 'बाट',
  searchStartLocation: 'सुरुवात स्थान खोज्नुहोस्',
  yourLocation: 'तपाईंको स्थान',
  boardAt: 'चढ्ने ठाउँ',
  getOffAt: 'ओर्लने ठाउँ',
  planning: 'योजना बनाउँदै...',
  directions: 'दिशानिर्देश',
  busRoute: 'बस मार्ग',
  selectDestination: 'पहिले गन्तव्य छान्नुहोस्।',
  fromUnavailable: 'सुरुवात स्थान उपलब्ध छैन। सुरुवात बिन्दु छान्नुहोस्।',
  chooseFromLocation: 'सुरुवात स्थान छान्नुहोस् वा तपाईंको स्थान थिच्नुहोस्।',

  allBusRoutes: 'सबै बस मार्गहरू',
  reload: 'पुन: लोड',
  searchRouteName: 'मार्गको नाम खोज्नुहोस्',
  loadingRoutes: 'मार्गहरू लोड हुँदैछ...',
  noMatchingRoutes: 'कुनै मिल्दो मार्ग भेटिएन।',
  back: 'पछाडि',
  routeDetail: 'मार्ग विवरण',
  loadingRouteMap: 'मार्ग नक्सा लोड हुँदैछ...',
  searchAreaPanMap: 'नक्सा प्यान गर्न क्षेत्र खोज्नुहोस्',
  tappedPoint: 'ट्याप गरिएको बिन्दु',
  copyLonLat: 'lon/lat कपी गर्नुहोस्',
  copied: 'कपी भयो',
  routeShapeUnavailable: 'यस भेरियन्टको लागि सटीक सडक मार्ग अस्थायी रूपमा उपलब्ध छैन।',

  nearbyStops: 'नजिकका बिसौनी',
  noNearbyStops: 'नजिकमा कुनै बिसौनी भेटिएन।',
};

const translations = { en, ne };

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const t = translations[language];

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'en' || value === 'ne') setLanguageState(value);
    });
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
