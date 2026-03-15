import { StyleSheet, Text, View } from "react-native";
import type { GlassTheme } from "./glassTheme";

type ExpandableDetailTileProps = {
  lines: string[];
  theme: GlassTheme;
};

export function ExpandableDetailTile({ lines, theme }: ExpandableDetailTileProps) {
  const visible = lines.filter((line) => Boolean(line && line.trim())).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {visible.map((line, index) => (
        <View key={`${line}-${index}`} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: theme.detailMeta }]} />
          <Text numberOfLines={1} style={[styles.text, { color: theme.detailMeta }]}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
});

