import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Store, Tag, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, LIQUID, SPACING, RADIUS, TYPE } from "../../src/theme";
import { getSearchStats, type SearchStatsResponse } from "../../src/api/client";
import { friendlyChatError, fmtMoney } from "../../src/features/search/searchUtils";
import { storeChartColor, storeInitials } from "../../src/features/search/searchUiHelpers";

const SECTION_GAP = 24;
const CARD_PADDING = 18;
/** Extra space below Insights content so the floating pill tab bar does not cover the Summary card. */
const INSIGHTS_SCROLL_BOTTOM_EXTRA = 56;

type InsightsDetailTab = "categories" | "stores" | "visits";

function emptyStats(): Pick<
  SearchStatsResponse,
  "topCategories" | "topStoresBySpend" | "topStoresByVisits"
> {
  return { topCategories: [], topStoresBySpend: [], topStoresByVisits: [] };
}

export default function InsightsScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  const refreshKey = useStore((s) => s.refreshKey ?? 0);

  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [searchStatsLoading, setSearchStatsLoading] = useState(false);
  const [searchStatsError, setSearchStatsError] = useState<string | null>(null);
  const [insightsDetailTab, setInsightsDetailTab] = useState<InsightsDetailTab>("categories");

  const statsSafe = useMemo(() => {
    if (!searchStats) {
      return {
        ...emptyStats(),
        last30Days: { totalSpend: 0, avgPerDay: 0 },
        needsReviewCount: 0,
        verifiedReceiptCount: 0,
      };
    }
    return {
      topCategories: searchStats.topCategories ?? [],
      topStoresBySpend: searchStats.topStoresBySpend ?? [],
      topStoresByVisits: searchStats.topStoresByVisits ?? [],
      last30Days: searchStats.last30Days,
      community: searchStats.community,
      mostVisitedStore: searchStats.mostVisitedStore,
      topCategory: searchStats.topCategory,
      needsReviewCount: searchStats.needsReviewCount ?? 0,
      verifiedReceiptCount: searchStats.verifiedReceiptCount ?? 0,
    };
  }, [searchStats]);

  const loadSearchStats = useCallback(() => {
    setSearchStatsError(null);
    setSearchStatsLoading(true);
    getSearchStats(authToken ?? null)
      .then((d) => setSearchStats(d))
      .catch((e) => {
        setSearchStats(null);
        setSearchStatsError(friendlyChatError(e));
      })
      .finally(() => setSearchStatsLoading(false));
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      loadSearchStats();
    }, [loadSearchStats, refreshKey])
  );

  const TAB_BAR_HEIGHT = 72;
  const tabBarBottom = Math.max(12, insets.bottom + 8);
  const tabBarReserve = TAB_BAR_HEIGHT + tabBarBottom;

  const maxCat = Math.max(0, ...statsSafe.topCategories.map((c) => c.amount));
  const maxSpend = Math.max(0, ...statsSafe.topStoresBySpend.map((s) => s.totalSpend));
  const maxVisits = Math.max(0, ...statsSafe.topStoresByVisits.map((s) => s.visits));

  const openScanner = useCallback(() => {
    router.push("/modal/scanner");
  }, [router]);

  const insightBar = (
    label: string,
    value: number,
    max: number,
    barColor: string,
    valueFormat: "money" | "count" = "money"
  ) => {
    const safeMax = max > 0 && Number.isFinite(max) ? max : 0;
    const safeVal = Number.isFinite(value) ? value : 0;
    const pct = safeMax > 0 ? Math.min(100, Math.max(0, (safeVal / safeMax) * 100)) : 0;
    const valueStr =
      valueFormat === "money" ? fmtMoney(value) : `${Math.max(0, Math.round(value)).toLocaleString()}`;
    return (
      <View style={styles.barRowWrap}>
        <View style={styles.barRowHeader}>
          <Text style={[styles.barRowLabel, { color: textPrimary }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.barRowValue, { color: textPrimary }]}>{valueStr}</Text>
        </View>
        <View
          style={[
            styles.barTrack,
            { backgroundColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
          ]}
        >
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    );
  };

  const statLine = (icon: ReactNode, label: string, value: string) => (
    <View style={[styles.statRow, { borderColor: "rgba(255,255,255,0.1)" }]}>
      <View style={styles.statRowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statLabel, { color: textSecondary }]}>{label}</Text>
        <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );

  const heroStore = statsSafe.topStoresBySpend[0];
  const heroInitials = heroStore ? storeInitials(heroStore.name) : "SB";

  const emptyInsight = (message: string) => (
    <View>
      <Text style={{ color: textSecondary, marginBottom: 14, lineHeight: 22 }}>{message}</Text>
      <TouchableOpacity
        onPress={openScanner}
        style={[styles.emptyScanBtn, { backgroundColor: IOS_BLUE }]}
        accessibilityRole="button"
        accessibilityLabel="Scan a receipt"
      >
        <Text style={styles.emptyScanBtnText}>Scan a receipt</Text>
      </TouchableOpacity>
    </View>
  );

  const skeletonMuted = isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textPrimary }]} accessibilityRole="header">
          Insights
        </Text>
        <Text style={[styles.scopeLine, { color: textSecondary }]} accessibilityLabel="Insights scope">
          Verified receipts · personal totals
        </Text>
      </View>

      <ScrollView
        style={styles.modeScroll}
        contentContainerStyle={[
          styles.insightsScrollInner,
          { paddingBottom: tabBarReserve + INSIGHTS_SCROLL_BOTTOM_EXTRA },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!searchStatsLoading && !searchStatsError && statsSafe.needsReviewCount > 0 ? (
          <TouchableOpacity
            onPress={() => router.push("/modal/library?filter=needs_review")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${statsSafe.needsReviewCount} receipts need review. Open library.`}
            style={styles.reviewBannerWrap}
          >
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={LIQUID.shadow} intensity={48}>
              <View style={styles.reviewBannerInner}>
                <Text style={[styles.reviewBannerTitle, { color: textPrimary }]}>
                  {statsSafe.needsReviewCount} receipt{statsSafe.needsReviewCount === 1 ? "" : "s"} not in these charts
                </Text>
                <Text style={[styles.reviewBannerSub, { color: textSecondary }]}>
                  Review in Library to include them here.
                </Text>
                <Text style={[styles.reviewBannerCta, { color: IOS_BLUE }]}>Open Library</Text>
              </View>
            </GlassSurface>
          </TouchableOpacity>
        ) : null}

        {searchStatsLoading ? (
          <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={LIQUID.shadow}>
              <View style={styles.heroCardInner}>
                <View style={[styles.heroAvatar, { backgroundColor: skeletonMuted }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ width: 88, height: 11, borderRadius: 4, backgroundColor: skeletonMuted, marginBottom: 10 }} />
                  <View style={{ width: "78%", height: 17, borderRadius: 4, backgroundColor: skeletonMuted, marginBottom: 10 }} />
                  <View style={{ width: 112, height: 26, borderRadius: 4, backgroundColor: skeletonMuted }} />
                </View>
              </View>
            </GlassSurface>
          </View>
        ) : searchStatsError ? (
          <Text style={[styles.statsError, { color: textSecondary }]}>{searchStatsError}</Text>
        ) : (
          <>
            {heroStore ? (
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={LIQUID.shadow}>
                <View style={styles.heroCardInner}>
                  <View style={[styles.heroAvatar, { backgroundColor: "rgba(10,132,255,0.22)" }]}>
                    <Text style={[styles.heroAvatarText, { color: IOS_BLUE }]}>{heroInitials}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.heroEyebrow, { color: textSecondary }]}>Top spend</Text>
                    <Text style={[styles.heroTitle, { color: textPrimary }]} numberOfLines={2}>
                      {heroStore.name}
                    </Text>
                    <Text style={[styles.heroAmount, { color: textPrimary }]}>{fmtMoney(heroStore.totalSpend)}</Text>
                  </View>
                </View>
              </GlassSurface>
            ) : (
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={LIQUID.shadow}>
                <View style={{ padding: CARD_PADDING }}>
                  {emptyInsight("No spending highlights yet. Scan a receipt to see your top stores and categories here.")}
                </View>
              </GlassSurface>
            )}

            <View style={{ marginTop: SECTION_GAP }}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>Spending breakdown</Text>
              <GlassSurface
                isDark={isDarkMode}
                borderRadius={16}
                intensity={44}
                style={[LIQUID.shadow, styles.segmentGlass, { marginTop: 12 }]}
              >
                <View style={styles.segmentWrap} accessibilityRole="tablist" accessibilityLabel="Insight breakdown">
                  {(
                    [
                      { k: "categories", label: "Categories" },
                      { k: "stores", label: "Stores" },
                      { k: "visits", label: "Visits" },
                    ] as const
                  ).map((t) => (
                    <TouchableOpacity
                      key={t.k}
                      style={[styles.segmentBtn, insightsDetailTab === t.k && styles.segmentBtnActive]}
                      onPress={() => setInsightsDetailTab(t.k)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: insightsDetailTab === t.k }}
                      accessibilityLabel={t.label}
                    >
                      <Text style={[styles.segmentBtnText, { color: insightsDetailTab === t.k ? IOS_BLUE : textSecondary }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassSurface>

              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
                <View style={{ padding: CARD_PADDING }}>
                  {insightsDetailTab === "categories" ? (
                    statsSafe.topCategories.length === 0 ? (
                      emptyInsight("No category data yet. Verified receipts with line-item categories will appear here.")
                    ) : (
                      statsSafe.topCategories.map((c, i) => (
                        <View key={`cat-${i}-${c.name}`}>
                          {insightBar(c.name, c.amount, maxCat || 1, ["#34C759", "#007AFF", "#FF9500", "#AF52DE", "#FF3B30"][i % 5])}
                        </View>
                      ))
                    )
                  ) : insightsDetailTab === "stores" ? (
                    statsSafe.topStoresBySpend.length === 0 ? (
                      emptyInsight("No store spend yet. Scan a receipt to build your store leaderboard.")
                    ) : (
                      statsSafe.topStoresBySpend.map((s, i) => (
                        <View key={`spend-${i}-${s.name}`}>
                          {insightBar(s.name, s.totalSpend, maxSpend || 1, storeChartColor(s.name))}
                        </View>
                      ))
                    )
                  ) : statsSafe.topStoresByVisits.length === 0 ? (
                    emptyInsight("No visit counts yet. Scan receipts to see where you shop most often.")
                  ) : (
                    statsSafe.topStoresByVisits.map((s, i) => (
                      <View key={`vis-${i}-${s.name}`}>
                        {insightBar(s.name, s.visits, maxVisits || 1, storeChartColor(s.name), "count")}
                      </View>
                    ))
                  )}
                </View>
              </GlassSurface>
            </View>

            <View style={{ marginTop: SECTION_GAP }}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>Summary</Text>
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
                <View style={{ padding: CARD_PADDING }}>
                  {statLine(
                    <CalendarDays size={18} color={IOS_BLUE} />,
                    "Last 30 days (avg / day)",
                    searchStats ? `${fmtMoney(searchStats.last30Days.avgPerDay)} · ${fmtMoney(searchStats.last30Days.totalSpend)} total` : "—"
                  )}
                  {statLine(
                    <Users size={18} color={IOS_BLUE} />,
                    "Community avg price (weighted)",
                    searchStats?.community ? fmtMoney(searchStats.community.weightedAvgPrice) : "No community data yet"
                  )}
                  {searchStats?.mostVisitedStore ? (
                    statLine(
                      <Store size={18} color={IOS_BLUE} />,
                      "Most visited store",
                      `${searchStats.mostVisitedStore.name} · ${searchStats.mostVisitedStore.visits} visits`
                    )
                  ) : null}
                  {searchStats?.topCategory ? (
                    statLine(
                      <Tag size={18} color={IOS_BLUE} />,
                      "Top category",
                      `${searchStats.topCategory.name} · ${fmtMoney(searchStats.topCategory.amount)}`
                    )
                  ) : null}
                </View>
              </GlassSurface>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 8 },
  title: { fontSize: TYPE.pageTitle, fontWeight: "800", marginBottom: 4 },
  scopeLine: { fontSize: TYPE.helper, fontWeight: "600", lineHeight: 18 },

  reviewBannerWrap: { marginBottom: 12 },
  reviewBannerInner: { padding: 16 },
  reviewBannerTitle: { fontSize: TYPE.secondary, fontWeight: "700" },
  reviewBannerSub: { fontSize: TYPE.body, marginTop: 6, lineHeight: 21 },
  reviewBannerCta: { fontSize: TYPE.secondary, fontWeight: "600", marginTop: 10 },

  modeScroll: { flex: 1 },
  insightsScrollInner: {
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 8,
  },
  sectionTitle: { fontSize: TYPE.sectionTitle, fontWeight: "800" },

  statsError: { fontSize: TYPE.body, lineHeight: 21 },

  heroCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: CARD_PADDING,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { fontSize: 20, fontWeight: "800" },
  heroEyebrow: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  heroTitle: { fontSize: TYPE.secondary, fontWeight: "800", marginTop: 2 },
  heroAmount: { fontSize: TYPE.pageTitle, fontWeight: "800", marginTop: 4 },

  segmentGlass: {},
  segmentWrap: { flexDirection: "row", gap: 8, padding: 6 },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  segmentBtnActive: { backgroundColor: "rgba(10,132,255,0.18)" },
  segmentBtnText: { fontSize: TYPE.secondary, fontWeight: "800" },

  barRowWrap: { marginBottom: 14 },
  barRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 },
  barRowLabel: { flex: 1, fontSize: TYPE.secondary, fontWeight: "600" },
  barRowValue: { fontSize: TYPE.secondary, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },

  emptyScanBtn: { alignSelf: "flex-start", minHeight: 44, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, justifyContent: "center" },
  emptyScanBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },

  statRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  statRowIcon: { marginTop: 2, width: 24, alignItems: "center" },
  statLabel: { fontSize: TYPE.helper, fontWeight: "600", marginBottom: 4 },
  statValue: { fontSize: TYPE.body, fontWeight: "700", lineHeight: 21 },
});

