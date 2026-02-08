'use client';

// app/index.tsx (or SettingsScreen.tsx if you're using navigation)
import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const SettingsScreen = () => {
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [language, setLanguage] = useState('English');

  const handleNavigate = (screen: string) => {
    console.log(`Navigating to ${screen}`);
    // Add your navigation logic here
  };

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
      style={[styles.settingItemContainer, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {showArrow && (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color="#999"
          style={styles.arrow}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <Text style={styles.header}>Settings</Text>

        {/* User Profile - Standalone */}
        <SettingItem
          icon={<Ionicons name="person-circle" size={28} color="#2dd4a4" />}
          iconBg="rgba(45, 212, 164, 0.2)"
          title="User Profile"
          subtitle="Tap to view profile details"
          onPress={() => handleNavigate('Profile')}
        />

        {/* Dark Mode & Language - Grouped */}
        <View style={styles.groupedContainer}>
          {/* Dark Mode */}
          <View style={styles.settingItemContainer}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 164, 0.2)' }]}>
              <MaterialCommunityIcons name="moon-waning-crescent" size={20} color="#2dd4a4" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Dark Mode</Text>
              <Text style={styles.subtitle}>Reduce eye strain with darker colors</Text>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#555', true: '#2dd4a4' }}
              thumbColor={darkModeEnabled ? '#2dd4a4' : '#999'}
              style={styles.switch}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Language */}
          <View style={styles.settingItemContainer}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 164, 0.2)' }]}>
              <MaterialCommunityIcons name="earth" size={20} color="#2dd4a4" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Language</Text>
              <Text style={styles.subtitle}>Choose your preferred language</Text>
            </View>
            <TouchableOpacity style={styles.languageSelector}>
              <Text style={styles.languageText}>{language}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info & Feedback - Grouped */}
        <View style={styles.groupedContainer}>
          {/* App Info */}
          <SettingItem
            icon={<Ionicons name="information-circle" size={28} color="#2dd4a4" />}
            iconBg="rgba(45, 212, 164, 0.2)"
            title="App Info"
            subtitle="Version 1.0.0"
            onPress={() => handleNavigate('AppInfo')}
            style={styles.groupedItem}
          />

          {/* Divider */}
          <View style={styles.divider} />

          {/* Feedback */}
          <SettingItem
            icon={<MaterialCommunityIcons name="message-text" size={24} color="#2dd4a4" />}
            iconBg="rgba(45, 212, 164, 0.2)"
            title="Feedback"
            subtitle="Share your thoughts with us"
            onPress={() => handleNavigate('Feedback')}
            style={styles.groupedItem}
          />
        </View>

        {/* Logout - Standalone */}
        <SettingItem
          icon={<MaterialCommunityIcons name="exit-to-app" size={24} color="#ff6b6b" />}
          iconBg="rgba(255, 107, 107, 0.2)"
          title="Logout"
          subtitle="Sign out from this device"
          onPress={() => handleNavigate('Logout')}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  header: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  settingItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  groupedContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupedItem: {
    backgroundColor: 'transparent',
    marginBottom: 0,
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#3a3a3a',
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
    color: '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
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
    color: '#fff',
    marginRight: 4,
  },
});

export default SettingsScreen;
