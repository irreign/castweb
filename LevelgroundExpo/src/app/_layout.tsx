import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { ProfileProvider } from '@/context/ProfileContext';
import { ReadingProvider } from '@/context/ReadingContext';
import { ShortlistProvider } from '@/context/ShortlistContext';

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? Colors.dark : Colors.light;

  return (
    <SafeAreaProvider>
      <ProfileProvider>
        <ReadingProvider>
          <ShortlistProvider>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.ink,
                headerTitleStyle: { color: colors.ink },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="article/[id]" options={{ title: '' }} />
              <Stack.Screen name="property/[id]" options={{ title: '' }} />
              <Stack.Screen name="tools/mortgage" options={{ title: 'Affordability' }} />
              <Stack.Screen name="tools/yield" options={{ title: 'Rental Yield' }} />
              <Stack.Screen name="tools/checklist" options={{ title: 'Viewing Checklist' }} />
              <Stack.Screen name="tools/school-priority" options={{ title: 'School Priority Check' }} />
              <Stack.Screen name="tools/price-check" options={{ title: 'Price Check' }} />
            </Stack>
          </ShortlistProvider>
        </ReadingProvider>
      </ProfileProvider>
    </SafeAreaProvider>
  );
}
