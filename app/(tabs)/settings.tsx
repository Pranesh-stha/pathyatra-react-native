'use client';

import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useLanguage, type Language } from '@/context/LanguageContext';
import { useMapStyle } from '@/context/MapStyleContext';
import { getAppTabBarHeight } from '@/constants/tabBar';

const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ne', label: 'नेपाली (Nepali)' },
];

const SettingsScreen = () => {
  const { isDark, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isSatellite, setMapStyle } = useMapStyle();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getAppTabBarHeight(insets.bottom);
  const [langDropdownOpen, setLangDropdownOpen] = React.useState(false);
  const [appInfoOpen, setAppInfoOpen] = React.useState(false);

  const c = isDark ? darkColors : lightColors;
  const mapStyleSubtitle = isSatellite ? 'Satellite map view' : 'Default map view';

  const handleFeedback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const subject = encodeURIComponent('PathYatra Feedback');
    const body = encodeURIComponent('Hi PathYatra team,\n\n');
    Linking.openURL(`mailto:shrestha8pranesh@gmail.com?subject=${subject}&body=${body}`);
  };

  const currentLangLabel = LANGUAGE_OPTIONS.find((o) => o.code === language)?.label ?? 'English';

  const SettingItem = ({
    icon,
    iconBg,
    title,
    subtitle,
    onPress,
    showArrow = true,
    style,
  }: {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
    onPress: () => void;
    showArrow?: boolean;
    style?: any;
  }) => (
    <TouchableOpacity
      style={[styles.settingItemContainer, { backgroundColor: c.card }, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: c.title }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: c.subtitle }]}>{subtitle}</Text>
      </View>
      {showArrow && (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={c.chevron}
          style={styles.arrow}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 8 }]}
      >
        {/* Header */}
        <Text style={[styles.header, { color: c.title }]}>{t.settingsTitle}</Text>

        {/* Dark Mode, Language & Map Style - Grouped */}
        <View style={[styles.groupedContainer, { backgroundColor: c.card }]}>
          {/* Dark Mode */}
          <View style={[styles.settingItemContainer, { backgroundColor: 'transparent' }]}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 164, 0.2)' }]}>
              <MaterialCommunityIcons
                name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
                size={20}
                color="#2dd4a4"
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: c.title }]}>{t.darkMode}</Text>
              <Text style={[styles.subtitle, { color: c.subtitle }]}>
                {isDark ? t.switchToLight : t.switchToDark}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: isDark ? '#555' : '#d1d5db', true: '#2dd4a4' }}
              thumbColor={isDark ? '#2dd4a4' : '#9ca3af'}
              style={styles.switch}
            />
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          {/* Language */}
          <View style={[styles.settingItemContainer, { backgroundColor: 'transparent' }]}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 164, 0.2)' }]}>
              <MaterialCommunityIcons name="earth" size={20} color="#2dd4a4" />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: c.title }]}>{t.language}</Text>
              <Text style={[styles.subtitle, { color: c.subtitle }]}>{t.chooseLanguage}</Text>
            </View>
            <TouchableOpacity
              style={styles.languageSelector}
              onPress={() => setLangDropdownOpen(true)}
            >
              <Text style={[styles.languageText, { color: c.title }]}>{currentLangLabel}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={c.chevron} />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          {/* Map Style */}
          <View style={[styles.settingItemContainer, { backgroundColor: 'transparent' }]}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 164, 0.2)' }]}>
              <MaterialCommunityIcons
                name={isSatellite ? 'satellite-variant' : 'map-outline'}
                size={20}
                color="#2dd4a4"
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: c.title }]}>Map Style</Text>
              <Text style={[styles.subtitle, { color: c.subtitle }]}>{mapStyleSubtitle}</Text>
            </View>
            <Switch
              value={isSatellite}
              onValueChange={(value) => setMapStyle(value ? 'satellite' : 'default')}
              trackColor={{ false: isDark ? '#555' : '#d1d5db', true: '#2dd4a4' }}
              thumbColor={isDark ? '#2dd4a4' : '#9ca3af'}
              style={styles.switch}
            />
          </View>
        </View>

        {/* App Info & Feedback - Grouped */}
        <View style={[styles.groupedContainer, { backgroundColor: c.card }]}>
          {/* App Info */}
          <SettingItem
            icon={<Ionicons name="information-circle" size={28} color="#2dd4a4" />}
            iconBg="rgba(45, 212, 164, 0.2)"
            title={t.appInfo}
            subtitle={t.version}
            onPress={() => setAppInfoOpen(true)}
            style={styles.groupedItem}
          />

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: c.divider }]} />

          {/* Feedback */}
          <SettingItem
            icon={<MaterialCommunityIcons name="message-text" size={24} color="#2dd4a4" />}
            iconBg="rgba(45, 212, 164, 0.2)"
            title={t.feedback}
            subtitle={t.feedbackSubtitle}
            onPress={handleFeedback}
            style={styles.groupedItem}
          />
        </View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal
        visible={langDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangDropdownOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLangDropdownOpen(false)}>
          <View style={[styles.modalContent, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.title }]}>{t.language}</Text>
            {LANGUAGE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.code}
                style={[
                  styles.langOption,
                  language === option.code && styles.langOptionActive,
                ]}
                onPress={() => {
                  setLanguage(option.code);
                  setLangDropdownOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.langOptionText,
                    { color: c.title },
                    language === option.code && styles.langOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {language === option.code && (
                  <Ionicons name="checkmark" size={20} color="#2dd4a4" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* App Info Modal */}
      <Modal
        visible={appInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAppInfoOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAppInfoOpen(false)}>
          <Pressable style={[styles.infoModalCard, { backgroundColor: c.card }]} onPress={() => {}}>
            <View style={styles.infoModalHeader}>
              <Text style={[styles.modalTitle, { color: c.title, marginBottom: 0 }]}>{t.appInfo}</Text>
              <TouchableOpacity
                onPress={() => setAppInfoOpen(false)}
                style={styles.infoCloseButton}
                accessibilityLabel="Close app info"
              >
                <Ionicons name="close" size={22} color={c.title} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.infoDescription, { color: c.subtitle }]}>
              PathYatra helps you discover routes, stops, and places on an interactive map.
            </Text>
            <Text style={[styles.infoVersion, { color: c.subtitle }]}>{t.version}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const darkColors = {
  bg: '#1a1a1a',
  card: '#2a2a2a',
  title: '#ffffff',
  subtitle: '#888888',
  divider: '#3a3a3a',
  chevron: '#999999',
};

const lightColors = {
  bg: '#c8d4de',
  card: '#d8e2ea',
  title: '#1a1a1a',
  subtitle: '#4a5568',
  divider: '#b8c6d0',
  chevron: '#8a9aaa',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  header: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  settingItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  groupedContainer: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupedItem: {
    marginBottom: 0,
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  divider: {
    height: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  arrow: {
    marginLeft: 8,
  },
  switch: {
    marginLeft: 8,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  languageText: {
    fontSize: 15,
    fontWeight: '600',
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 280,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  langOptionActive: {
    backgroundColor: 'rgba(45, 212, 164, 0.15)',
  },
  langOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  langOptionTextActive: {
    color: '#2dd4a4',
    fontWeight: '700',
  },
  infoModalCard: {
    width: 300,
    maxWidth: '88%',
    borderRadius: 16,
    padding: 18,
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoCloseButton: {
    padding: 4,
    marginRight: -4,
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  infoVersion: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default SettingsScreen;
