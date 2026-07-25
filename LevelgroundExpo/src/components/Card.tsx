import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radii, Spacing, useColors } from '@/constants/theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
});
