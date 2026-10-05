import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  tags: readonly string[];
  selected: string[];
  onToggle: (tag: string) => void;
  /** One scrolling row (filters) instead of a wrapping grid (upload form). */
  horizontal?: boolean;
};

export default function TagPicker({ tags, selected, onToggle, horizontal }: Props) {
  const chips = tags.map((t) => {
    const on = selected.includes(t);
    return (
      <Pressable
        key={t}
        onPress={() => onToggle(t)}
        style={[styles.chip, on && styles.chipOn]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
      >
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
      </Pressable>
    );
  });

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {chips}
      </ScrollView>
    );
  }
  return <View style={styles.wrap}>{chips}</View>;
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 16,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: '#ff6600',
    borderColor: '#ff6600',
  },
  chipText: {
    color: '#ccc',
    fontSize: 13,
  },
  chipTextOn: {
    color: '#000',
    fontWeight: '700',
  },
});
