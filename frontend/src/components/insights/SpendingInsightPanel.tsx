import { StyleSheet, Text, View } from "react-native";
import type { GlassTheme } from "./glassTheme";
import type { InsightTileModel } from "./types";

type SpendingInsightPanelProps = {
  selectedTile: InsightTileModel | null;
  theme: GlassTheme;
  backgroundColor?: string;
};

export function SpendingInsightPanel({ selectedTile, theme, backgroundColor }: SpendingInsightPanelProps) {
  if (!selectedTile) {
    return <Text style={[styles.hintText, { color: theme.helperText }]}>Tap a tile to view deeper insights.</Text>;
  }

  const detailParts = (selectedTile.detailLine ?? "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: backgroundColor ?? theme.detailBackground,
          borderColor: theme.detailBorder,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.detailTitle }]}>{selectedTile.title}</Text>
      <Text style={[styles.value, { color: theme.detailValue }]}>{selectedTile.value}</Text>
      {detailParts.map((part, idx) => (
        <Text key={`${part}-${idx}`} style={[styles.meta, { color: theme.detailMeta }]}>
          {part}
        </Text>
      ))}
      {detailParts.length === 0 ? (
        <Text style={[styles.meta, { color: theme.detailMeta }]}>Spending insight from your latest data.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  value: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  hintText: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
});

