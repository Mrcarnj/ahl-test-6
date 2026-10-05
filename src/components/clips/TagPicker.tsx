import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  selected: string[];
  onToggle: (tag: string) => void;
} & (
  | {
      tags: readonly string[];
      /** One scrolling row (filters) instead of a wrapping grid. */
      horizontal?: boolean;
      categories?: never;
    }
  | {
      /** A wrapping grid per category, each under its own heading (upload/edit forms). */
      categories: readonly { name: string; tags: readonly string[] }[];
      tags?: never;
      horizontal?: never;
    }
);

export default function TagPicker(props: Props) {
  const { selected, onToggle } = props;

  const chipsFor = (tags: readonly string[]) => tags.map((t) => {
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

  if (props.categories) {
    return (
      <View style={styles.categories}>
        {props.categories.map((c) => (
          <View key={c.name}>
            <Text style={styles.categoryName}>{c.name}</Text>
            <View style={styles.wrap}>{chipsFor(c.tags)}</View>
          </View>
        ))}
      </View>
    );
  }

  const chips = chipsFor(props.tags);
  if (props.horizontal) {
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
  categories: {
    gap: 16,
  },
  categoryName: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
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
