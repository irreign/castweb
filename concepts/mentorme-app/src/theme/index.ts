import { useColorScheme } from 'react-native';

export type Palette = {
  ink: string;
  inkSoft: string;
  inkFaint: string;
  paper: string;
  surface: string;
  surfaceSunk: string;
  line: string;
  gold: string;
  goldStrong: string;
  teal: string;
  plum: string;
  success: string;
  critical: string;
};

const light: Palette = {
  ink: '#16213A',
  inkSoft: '#4B5568',
  inkFaint: '#7C8894',
  paper: '#EEF1EF',
  surface: '#FFFFFF',
  surfaceSunk: '#E4E9E6',
  line: '#DBE1DD',
  gold: '#B87F1F',
  goldStrong: '#96660F',
  teal: '#1B6763',
  plum: '#6B4C6B',
  success: '#2F7A4E',
  critical: '#A83F33',
};

const dark: Palette = {
  ink: '#E9ECE8',
  inkSoft: '#AAB4AD',
  inkFaint: '#7C8880',
  paper: '#10161A',
  surface: '#1A2124',
  surfaceSunk: '#141A1D',
  line: '#2A3336',
  gold: '#E2A83F',
  goldStrong: '#F0BE63',
  teal: '#45A39C',
  plum: '#A882A8',
  success: '#5FB981',
  critical: '#E0806F',
};

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
