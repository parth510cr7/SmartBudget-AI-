import { useEffect, useMemo, useState } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getGlassTheme } from "./insights/glassTheme";
import { GlassTileGroup } from "./insights/GlassTileGroup";
import { SpendingInsightPanel } from "./insights/SpendingInsightPanel";
import type {
  InsightIconName,
  InsightTileContentMode,
  InsightTileModel,
  InsightTilePriority,
  InsightTileSize,
} from "./insights/types";

export type SpendingGlassTileDatum = {
  category: string;
  amount: number;
  detailLine?: string;
  kind?: "category" | "store";
};

export type SpendingGlassTileBoardProps = {
  data: SpendingGlassTileDatum[];
  onTilePress?: (datum: SpendingGlassTileDatum) => void;
  maxTiles?: number;
  isDarkMode?: boolean;
  textPrimary?: string;
  textSecondary?: string;
  detailCardBackgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZE_PATTERN: InsightTileSize[] = ["large", "medium", "tall", "wide", "medium", "small", "small", "small"];
const PRIORITY_PATTERN: InsightTilePriority[] = [
  "primary",
  "secondary",
  "secondary",
  "secondary",
  "tertiary",
  "tertiary",
  "tertiary",
  "tertiary",
];
const CONTENT_PATTERN: InsightTileContentMode[] = [
  "expanded_detail",
  "icon_label_value",
  "icon_label_value",
  "label_value",
  "icon_label_value",
  "icon_label",
  "icon_label",
  "label_value",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function datumKey(datum: SpendingGlassTileDatum): string {
  return `${datum.kind ?? "category"}::${datum.category}::${Number(datum.amount)}`;
}

function formatCompactMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function chooseIcon(datum: SpendingGlassTileDatum): InsightIconName {
  const key = datum.category.toLowerCase();
  if (datum.kind === "store") return "store";
  if (/(grocery|grocer|supermarket|food)/.test(key)) return "cart";
  if (/(dining|restaurant|cafe|coffee|snack)/.test(key)) return "utensils";
  if (/(transport|car|fuel|gas|travel|uber|taxi)/.test(key)) return "car";
  if (/(house|housing|rent|home|utilities)/.test(key)) return "home";
  if (/(shop|fashion|retail)/.test(key)) return "bag";
  if (/(health|medical|pharma|care|wellness)/.test(key)) return "heart";
  if (/(personal|beauty|self)/.test(key)) return "sparkles";
  if (/(salary|income|pay|wallet|finance)/.test(key)) return "wallet";
  return "dollar";
}

function reorderKeys(keys: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return keys;
  const next = [...keys];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function buildTiles(input: SpendingGlassTileDatum[], maxTiles: number): InsightTileModel[] {
  const clean = input
    .filter((d) => d && typeof d.category === "string" && d.category.trim() && Number(d.amount) > 0)
    .slice(0, maxTiles);
  if (clean.length === 0) return [];

  const sorted = [...clean].sort((a, b) => b.amount - a.amount);
  const categories = sorted.filter((d) => d.kind !== "store");
  const stores = sorted.filter((d) => d.kind === "store");
  const ordered = [...categories, ...stores].slice(0, maxTiles);
  const total = Math.max(
    ordered.reduce((sum, d) => (d.kind === "store" ? sum : sum + d.amount), 0),
    1
  );

  return ordered.map((datum, index) => {
    const ratio = clamp(datum.amount / total, 0, 1);
    const contentMode = CONTENT_PATTERN[index] ?? "icon_label_value";
    const size = SIZE_PATTERN[index] ?? "small";
    const priority = PRIORITY_PATTERN[index] ?? "tertiary";
    const id = datumKey(datum);
    const value = formatCompactMoney(datum.amount);
    const percent = `${Math.round(ratio * 100)}% of visible spend`;
    const quickStats = [percent].filter(Boolean);
    const expandedLines = [
      `Exact total: $${datum.amount.toFixed(2)}`,
      percent,
      datum.detailLine ?? "",
      datum.kind === "store" ? "Signal: Most-spent store tile" : "Signal: Category tile",
    ].filter(Boolean);
    const detailBits = [datum.detailLine ?? "", percent].filter(Boolean).join(" · ");

    return {
      id,
      kind: datum.kind === "store" ? "store" : "category",
      title: datum.category,
      value,
      numericValue: datum.amount,
      detailLine: detailBits,
      quickStats,
      expandedLines,
      priority,
      size,
      state: "default",
      contentMode,
      iconName: chooseIcon(datum),
      paletteIndex: index,
    };
  });
}

export function SpendingGlassTileBoard({
  data,
  onTilePress,
  maxTiles = 7,
  isDarkMode = false,
  textPrimary,
  textSecondary,
  detailCardBackgroundColor,
  style,
}: SpendingGlassTileBoardProps) {
  const theme = useMemo(() => getGlassTheme(isDarkMode, textPrimary, textSecondary), [isDarkMode, textPrimary, textSecondary]);
  const baseTiles = useMemo(() => buildTiles(data, maxTiles), [data, maxTiles]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adjustedIds, setAdjustedIds] = useState<string[]>([]);
  const [adjustMode, setAdjustMode] = useState(false);

  useEffect(() => {
    const baseIds = baseTiles.map((tile) => tile.id);
    setOrderedIds((prev) => {
      const kept = prev.filter((id) => baseIds.includes(id));
      const missing = baseIds.filter((id) => !kept.includes(id));
      const next = [...kept, ...missing];
      return next.length === prev.length && next.every((id, idx) => prev[idx] === id) ? prev : next;
    });
    setAdjustedIds((prev) => prev.filter((id) => baseIds.includes(id)));
    setSelectedId((prev) => (prev && baseIds.includes(prev) ? prev : null));
    setExpandedId((prev) => (prev && baseIds.includes(prev) ? prev : null));
  }, [baseTiles]);

  const orderedTiles = useMemo(() => {
    if (baseTiles.length === 0) return [];
    if (orderedIds.length === 0) return baseTiles;
    const byId = new Map(baseTiles.map((tile) => [tile.id, tile]));
    const arranged = orderedIds
      .map((id) => byId.get(id))
      .filter((tile): tile is InsightTileModel => Boolean(tile));
    const missing = baseTiles.filter((tile) => !orderedIds.includes(tile.id));
    return [...arranged, ...missing];
  }, [baseTiles, orderedIds]);

  const selectedTile = orderedTiles.find((tile) => tile.id === selectedId) ?? null;
  const expandedTile = orderedTiles.find((tile) => tile.id === expandedId) ?? null;
  const adjustedSet = useMemo(() => new Set(adjustedIds), [adjustedIds]);

  if (orderedTiles.length === 0) return null;

  const reorderTileToIndex = (id: string, toIndex: number) => {
    setOrderedIds((prev) => {
      const current = prev.length > 0 ? prev : orderedTiles.map((tile) => tile.id);
      const from = current.indexOf(id);
      if (from < 0) return current;
      const to = clamp(toIndex, 0, current.length - 1);
      if (to === from) return current;
      return reorderKeys(current, from, to);
    });
    setAdjustedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleTileSelect = (tile: InsightTileModel) => {
    setSelectedId(tile.id);
    setExpandedId(null);
    setAdjustedIds((prev) => prev.filter((id) => id !== tile.id));
    const original = data.find((datum) => datumKey(datum) === tile.id);
    if (original) onTilePress?.(original);
  };

  const handleTileExpand = (tile: InsightTileModel) => {
    setExpandedId(tile.id);
    setSelectedId(tile.id);
    setAdjustedIds((prev) => prev.filter((id) => id !== tile.id));
  };

  return (
    <View style={style}>
      <View style={[styles.board, { backgroundColor: theme.boardBackground, borderColor: theme.boardBorder }]}>
        <LinearGradient
          pointerEvents="none"
          colors={theme.boardGlow}
          start={{ x: 0.15, y: 0.0 }}
          end={{ x: 0.75, y: 0.9 }}
          style={styles.boardGlow}
        />
        <View pointerEvents="none" style={[styles.boardInner, { borderColor: theme.boardInnerBorder }]} />

        <View style={styles.headerRow}>
          <Text style={[styles.helperText, { color: theme.helperText }]}>
            {adjustMode
              ? "Edit mode: drag to reorder, tap resize to change size."
              : "Tap for details. Long press for rich detail. Long press longer to edit layout."}
          </Text>
        </View>

        <GlassTileGroup
          tiles={orderedTiles}
          theme={theme}
          selectedId={selectedId}
          expandedId={expandedId}
          adjustedIds={adjustedSet}
          adjustMode={adjustMode}
          onSelect={handleTileSelect}
          onExpand={handleTileExpand}
          onReorderToIndex={reorderTileToIndex}
          onSwapToIndex={(fromIndex, toIndex) => {
            setOrderedIds((prev) => {
              const current = prev.length > 0 ? prev : orderedTiles.map((t) => t.id);
              if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
              const next = [...current];
              const tmp = next[fromIndex];
              next[fromIndex] = next[toIndex];
              next[toIndex] = tmp;
              return next;
            });
          }}
          onRequestAdjustMode={() => setAdjustMode(true)}
          onRequestExitAdjustMode={() => setAdjustMode(false)}
        />
      </View>

      <SpendingInsightPanel
        selectedTile={expandedTile ?? selectedTile}
        theme={theme}
        backgroundColor={detailCardBackgroundColor ?? theme.detailBackground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    marginTop: 14,
    width: "100%",
    borderRadius: 26,
    borderWidth: 1,
    overflow: "hidden",
    padding: 10,
    minHeight: 360,
    position: "relative",
  },
  boardGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  boardInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  helperText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
});

