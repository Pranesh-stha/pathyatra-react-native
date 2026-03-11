import React, { createContext, useContext, useState } from 'react';

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
};

const ne: Translations = {
  home: 'à¤—à¥ƒà¤¹',
  routes: 'à¤®à¤¾à¤°à¥à¤—à¤¹à¤°à¥‚',
  settings: 'à¤¸à¥‡à¤Ÿà¤¿à¤™à¥à¤¸',

  settingsTitle: 'à¤¸à¥‡à¤Ÿà¤¿à¤™à¥à¤¸',
  darkMode: 'à¤¡à¤¾à¤°à¥à¤• à¤®à¥‹à¤¡',
  switchToLight: 'à¤²à¤¾à¤‡à¤Ÿ à¤¥à¤¿à¤®à¤®à¤¾ à¤¸à¥à¤µà¤¿à¤š à¤—à¤°à¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  switchToDark: 'à¤¡à¤¾à¤°à¥à¤• à¤¥à¤¿à¤®à¤®à¤¾ à¤¸à¥à¤µà¤¿à¤š à¤—à¤°à¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  language: 'à¤­à¤¾à¤·à¤¾',
  chooseLanguage: 'à¤†à¤«à¥à¤¨à¥‹ à¤®à¤¨à¤ªà¤°à¥à¤¨à¥‡ à¤­à¤¾à¤·à¤¾ à¤›à¤¾à¤¨à¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  appInfo: 'à¤à¤ª à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
  version: 'à¤¸à¤‚à¤¸à¥à¤•à¤°à¤£ à¥§.à¥¦.à¥¦',
  feedback: 'à¤ªà¥à¤°à¤¤à¤¿à¤•à¥à¤°à¤¿à¤¯à¤¾',
  feedbackSubtitle: 'à¤¹à¤¾à¤®à¥€à¤¸à¤à¤— à¤†à¤«à¥à¤¨à¥‹ à¤µà¤¿à¤šà¤¾à¤° à¤¸à¤¾à¤à¤¾ à¤—à¤°à¥à¤¨à¥à¤¹à¥‹à¤¸à¥',

  searchPlaceholder: 'à¤ à¤¾à¤‰à¤à¤¹à¤°à¥‚, à¤¹à¥‹à¤Ÿà¤²à¤¹à¤°à¥‚, à¤²à¥à¤¯à¤¾à¤¨à¥à¤¡à¤®à¤¾à¤°à¥à¤•à¤¹à¤°à¥‚ à¤–à¥‹à¤œà¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  searching: 'à¤–à¥‹à¤œà¥à¤¦à¥ˆ...',
  noResults: 'à¤•à¥à¤¨à¥ˆ à¤ªà¤°à¤¿à¤£à¤¾à¤® à¤­à¥‡à¤Ÿà¤¿à¤à¤¨à¥¤',
  lookingUpPlace: 'à¤ à¤¾à¤‰à¤ à¤–à¥‹à¤œà¥à¤¦à¥ˆ...',
  from: 'à¤¬à¤¾à¤Ÿ',
  searchStartLocation: 'à¤¸à¥à¤°à¥à¤µà¤¾à¤¤ à¤¸à¥à¤¥à¤¾à¤¨ à¤–à¥‹à¤œà¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  yourLocation: 'à¤¤à¤ªà¤¾à¤ˆà¤‚à¤•à¥‹ à¤¸à¥à¤¥à¤¾à¤¨',
  boardAt: 'à¤šà¤¢à¥à¤¨à¥‡ à¤ à¤¾à¤‰à¤',
  getOffAt: 'à¤“à¤°à¥à¤²à¤¨à¥‡ à¤ à¤¾à¤‰à¤',
  planning: 'à¤¯à¥‹à¤œà¤¨à¤¾ à¤¬à¤¨à¤¾à¤‰à¤à¤¦à¥ˆ...',
  directions: 'à¤¦à¤¿à¤¶à¤¾à¤¨à¤¿à¤°à¥à¤¦à¥‡à¤¶',
  busRoute: 'à¤¬à¤¸ à¤®à¤¾à¤°à¥à¤—',
  selectDestination: 'à¤ªà¤¹à¤¿à¤²à¥‡ à¤—à¤¨à¥à¤¤à¤µà¥à¤¯ à¤›à¤¾à¤¨à¥à¤¨à¥à¤¹à¥‹à¤¸à¥à¥¤',
  fromUnavailable: 'à¤¸à¥à¤°à¥à¤µà¤¾à¤¤ à¤¸à¥à¤¥à¤¾à¤¨ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤›à¥ˆà¤¨à¥¤ à¤¸à¥à¤°à¥à¤µà¤¾à¤¤ à¤¬à¤¿à¤¨à¥à¤¦à¥ à¤›à¤¾à¤¨à¥à¤¨à¥à¤¹à¥‹à¤¸à¥à¥¤',
  chooseFromLocation: 'à¤¸à¥à¤°à¥à¤µà¤¾à¤¤ à¤¸à¥à¤¥à¤¾à¤¨ à¤›à¤¾à¤¨à¥à¤¨à¥à¤¹à¥‹à¤¸à¥ à¤µà¤¾ à¤¤à¤ªà¤¾à¤ˆà¤‚à¤•à¥‹ à¤¸à¥à¤¥à¤¾à¤¨ à¤¥à¤¿à¤šà¥à¤¨à¥à¤¹à¥‹à¤¸à¥à¥¤',

  allBusRoutes: 'à¤¸à¤¬à¥ˆ à¤¬à¤¸ à¤®à¤¾à¤°à¥à¤—à¤¹à¤°à¥‚',
  reload: 'à¤ªà¥à¤¨: à¤²à¥‹à¤¡',
  searchRouteName: 'à¤®à¤¾à¤°à¥à¤—à¤•à¥‹ à¤¨à¤¾à¤® à¤–à¥‹à¤œà¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  loadingRoutes: 'à¤®à¤¾à¤°à¥à¤—à¤¹à¤°à¥‚ à¤²à¥‹à¤¡ à¤¹à¥à¤à¤¦à¥ˆà¤›...',
  noMatchingRoutes: 'à¤•à¥à¤¨à¥ˆ à¤®à¤¿à¤²à¥à¤¦à¥‹ à¤®à¤¾à¤°à¥à¤— à¤­à¥‡à¤Ÿà¤¿à¤à¤¨à¥¤',
  back: 'à¤ªà¤›à¤¾à¤¡à¤¿',
  routeDetail: 'à¤®à¤¾à¤°à¥à¤— à¤µà¤¿à¤µà¤°à¤£',
  loadingRouteMap: 'à¤®à¤¾à¤°à¥à¤— à¤¨à¤•à¥à¤¸à¤¾ à¤²à¥‹à¤¡ à¤¹à¥à¤à¤¦à¥ˆà¤›...',
  searchAreaPanMap: 'à¤¨à¤•à¥à¤¸à¤¾ à¤ªà¥à¤¯à¤¾à¤¨ à¤—à¤°à¥à¤¨ à¤•à¥à¤·à¥‡à¤¤à¥à¤° à¤–à¥‹à¤œà¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  tappedPoint: 'à¤Ÿà¥à¤¯à¤¾à¤ª à¤—à¤°à¤¿à¤à¤•à¥‹ à¤¬à¤¿à¤¨à¥à¤¦à¥',
  copyLonLat: 'lon/lat à¤•à¤ªà¥€ à¤—à¤°à¥à¤¨à¥à¤¹à¥‹à¤¸à¥',
  copied: 'à¤•à¤ªà¥€ à¤­à¤¯à¥‹',
  routeShapeUnavailable: 'à¤¯à¤¸ à¤­à¥‡à¤°à¤¿à¤¯à¤¨à¥à¤Ÿà¤•à¥‹ à¤²à¤¾à¤—à¤¿ à¤¸à¤Ÿà¥€à¤• à¤¸à¤¡à¤• à¤®à¤¾à¤°à¥à¤— à¤…à¤¸à¥à¤¥à¤¾à¤¯à¥€ à¤°à¥‚à¤ªà¤®à¤¾ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤›à¥ˆà¤¨à¥¤',
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
  const [language, setLanguage] = useState<Language>('en');
  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

