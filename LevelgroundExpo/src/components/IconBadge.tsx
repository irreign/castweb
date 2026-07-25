import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/constants/theme';
import type { IconName } from '@/lib/models';

export function IconBadge({
  icon,
  tint,
  wash,
  size = 32,
}: {
  icon: IconName;
  tint?: string;
  wash?: string;
  size?: number;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: wash ?? colors.accentWash,
        },
      ]}
    >
      <Ionicons name={icon} size={size * 0.52} color={tint ?? colors.accentStrong} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
