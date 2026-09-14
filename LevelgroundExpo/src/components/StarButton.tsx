import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useColors } from '@/constants/theme';

export function StarButton({
  filled,
  onPress,
  size = 22,
}: {
  filled: boolean;
  onPress: () => void;
  size?: number;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={filled ? '#D9A63E' : colors.muted} />
    </Pressable>
  );
}
