import { useColorScheme } from 'react-native';

/**
 * Levelground brand tokens — a "field survey" identity: leveling the ground
 * for property decisions. Mirrors the palette used in the SwiftUI app and
 * the design mockup (Survey Ink / Vellum / Level Green / Benchmark Brass / Flag Red).
 */
export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  accentStrong: string;
  accentWash: string;
  brass: string;
  brassWash: string;
  flag: string;
  flagWash: string;
  warn: string;
}

export const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    bg: '#EFF1EA',
    surface: '#FBFBF6',
    surface2: '#E4E7DC',
    ink: '#161B22',
    muted: '#5B6560',
    border: '#D8DBCF',
    accent: '#2F6F4E',
    accentStrong: '#21543A',
    accentWash: '#E4EEE8',
    brass: '#B8862F',
    brassWash: '#F2E7D2',
    flag: '#B23B2E',
    flagWash: '#F5DFDC',
    warn: '#C98A2E',
  },
  dark: {
    bg: '#12160F',
    surface: '#1B211A',
    surface2: '#232B21',
    ink: '#EAEFE6',
    muted: '#9BA79C',
    border: '#2C332A',
    accent: '#4CA477',
    accentStrong: '#6BC091',
    accentWash: '#1E2D24',
    brass: '#D6A253',
    brassWash: '#2E2718',
    flag: '#D9614F',
    flagWash: '#301F1B',
    warn: '#D6A253',
  },
};

export function useColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export const Radii = { sm: 10, md: 12, lg: 16, pill: 999 };
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
