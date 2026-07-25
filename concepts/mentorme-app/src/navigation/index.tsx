import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';

import { useTheme } from '../theme';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import StationDetailScreen from '../screens/StationDetailScreen';
import CardsScreen from '../screens/CardsScreen';
import GrowScreen from '../screens/GrowScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { RootStackParamList, HomeStackParamList, MainTabParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="StationDetail" component={StationDetailScreen} />
    </HomeStack.Navigator>
  );
}

const TAB_ICON: Record<string, string> = {
  HomeTab: '🧭',
  Cards: '💳',
  Grow: '📈',
  Profile: '👤',
};

function MainTabs() {
  const c = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.goldStrong,
        tabBarInactiveTintColor: c.inkFaint,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{TAB_ICON[route.name]}</Text>,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} options={{ title: 'Line' }} />
      <Tab.Screen name="Cards" component={CardsScreen} options={{ title: 'Cards' }} />
      <Tab.Screen name="Grow" component={GrowScreen} options={{ title: 'Grow' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const scheme = useColorScheme();
  const c = useTheme();

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: c.paper,
      card: c.surface,
      text: c.ink,
      border: c.line,
      primary: c.gold,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="Main" component={MainTabs} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
