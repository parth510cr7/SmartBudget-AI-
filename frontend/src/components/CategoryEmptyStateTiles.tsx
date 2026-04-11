import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Car,
  CircleDollarSign,
  HeartPulse,
  House,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Utensils,
  Wallet,
} from "lucide-react-native";
import type { SpendingGlassTileDatum } from "./SpendingGlassTileBoard";
import { GlassSurface } from "./GlassSurface";
import { LIQUID, RADIUS, SPACING } from "../theme";

function categoryToIcon(datum: SpendingGlassTileDatum) {
  const key = datum.category.toLowerCase();
  if (datum.kind === "store") return Store;
  if (/(grocery|grocer|supermarket|food)/.test(key)) return ShoppingCart;
  if (/(dining|restaurant|cafe|coffee|snack)/.test(key)) return Utensils;
  if (/(transport|car|fuel|gas|travel|uber|taxi)/.test(key)) return Car;
  if (/(house|housing|rent|home|utilities)/.test(key)) return House;
  if (/(shop|fashion|retail)/.test(key)) return ShoppingBag;
  if (/(health|medical|pharma|care|wellness)/.test(key)) return HeartPulse;
  if (/(personal|beauty|self)/.test(key)) return Sparkles;
  if (/(salary|income|pay|wallet|finance)/.test(key)) return Wallet;
  return CircleDollarSign;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export type CategoryEmptyStateTilesProps = {
  data: SpendingGlassTileDatum[];
  onTilePress?: (datum: SpendingGlassTileDatum) => void;
  isDarkMode?: boolean;
  textPrimary?: string;
  textSecondary?: string;
  bg?: string;
};

const MAX_TILES = 5;
const ICON_SIZE_PRIMARY = 32;
const ICON_SIZE_SECONDARY = 22;

export function CategoryEmptyStateTiles({
  data,
  onTilePress,
  isDarkMode = false,
  textPrimary = "#111827",
  textSecondary = "#6B7280",
  bg = "#F2F2F7",
}: CategoryEmptyStateTilesProps) {
  const tiles = useMemo(() => {
    const filtered = data
      .filter((d) => d && typeof d.category === "string" && d.category.trim() && Number(d.amount) > 0)
      .slice(0, MAX_TILES)
      .sort((a, b) => b.amount - a.amount);
    const total = Math.max(filtered.reduce((s, d) => s + d.amount, 0), 1);
    return filtered.map((d) => ({
      datum: d,
      percent: Math.round((d.amount / total) * 100),
    }));
  }, [data]);

  if (tiles.length === 0) return null;

  const [primary, ...rest] = tiles;
  const PrimaryIcon = primary ? categoryToIcon(primary.datum) : CircleDollarSign;

  return (
    <View style={styles.wrapper}>
      {/* One large primary tile */}
      {primary && (
        <TouchableOpacity onPress={() => onTilePress?.(primary.datum)} activeOpacity={0.85}>
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.primaryTileOuter]}>
            <View style={styles.primaryTileInner}>
              <View style={[styles.primaryIconWrap, { backgroundColor: bg }]}>
                <PrimaryIcon size={ICON_SIZE_PRIMARY} color={isDarkMode ? "#8E8E93" : "#3A3A3C"} strokeWidth={2} />
              </View>
              <Text style={[styles.primaryCategory, { color: textPrimary }]} numberOfLines={1}>
                {primary.datum.category}
              </Text>
              <Text style={[styles.primaryAmount, { color: textPrimary }]}>{formatAmount(primary.datum.amount)}</Text>
              <Text style={[styles.primaryPercent, { color: textSecondary }]}>{primary.percent}% of spend</Text>
            </View>
          </GlassSurface>
        </TouchableOpacity>
      )}

      {/* Supporting smaller tiles */}
      <View style={styles.secondaryRow}>
        {rest.map(({ datum, percent }) => {
          const Icon = categoryToIcon(datum);
          return (
            <TouchableOpacity key={`${datum.category}-${datum.amount}`} onPress={() => onTilePress?.(datum)} activeOpacity={0.85}>
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.button} style={[LIQUID.shadow, styles.secondaryTileOuter]}>
                <View style={styles.secondaryTileInner}>
                  <View style={[styles.secondaryIconWrap, { backgroundColor: bg }]}>
                    <Icon size={ICON_SIZE_SECONDARY} color={isDarkMode ? "#8E8E93" : "#3A3A3C"} strokeWidth={2} />
                  </View>
                  <Text style={[styles.secondaryCategory, { color: textPrimary }]} numberOfLines={1}>
                    {datum.category}
                  </Text>
                  <Text style={[styles.secondaryAmount, { color: textPrimary }]}>{formatAmount(datum.amount)}</Text>
                  <Text style={[styles.secondaryPercent, { color: textSecondary }]}>{percent}%</Text>
                </View>
              </GlassSurface>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: SPACING.cardGap,
    gap: SPACING.cardGap,
  },
  primaryTileOuter: { minHeight: 100 },
  primaryTileInner: {
    padding: SPACING.cardPadding,
  },
  primaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  primaryCategory: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  primaryAmount: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 2,
  },
  primaryPercent: {
    fontSize: 13,
    fontWeight: "500",
  },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryTileOuter: {
    flex: 1,
    minWidth: "47%",
    maxWidth: "47%",
    minHeight: 88,
  },
  secondaryTileInner: {
    padding: 12,
  },
  secondaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  secondaryCategory: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  secondaryAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryPercent: {
    fontSize: 11,
    fontWeight: "500",
  },
});
