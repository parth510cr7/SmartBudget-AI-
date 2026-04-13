import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  User,
  Moon,
  Sun,
  Receipt,
  ShoppingBag,
  ChevronRight,
  Plus,
  X,
  Sparkles,
} from "lucide-react-native";
import { getSummary, getReceipts, getStores, type SummaryCategory } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, SPACING, RADIUS, SHADOW, LIQUID } from "../../src/theme";

function CategoryBarRow({
  name,
  amount,
  progress,
  textPrimary,
}: {
  name: string;
  amount: number;
  progress: number;
  textPrimary: string;
}) {
  return (
    <View style={styles.categoryBarRow}>
      <View style={styles.categoryBarHeader}>
        <Text style={[styles.categoryBarName, { color: textPrimary }]}>{name}</Text>
        <Text style={[styles.categoryBarAmount, { color: textPrimary }]}>${amount.toFixed(2)}</Text>
      </View>
      <View style={styles.categoryBarTrack}>
        <View style={[styles.categoryBarFill, { width: `${Math.min(100, progress)}%` }]} />
      </View>
    </View>
  );
}

type RecentTx = { id: string; store: { name: string }; total: number };

export default function DashboardScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const user = useStore((s) => s.user);
  const displayName = (user as { displayName?: string | null } | null)?.displayName ?? null;
  const userName = (user as { name?: string | null } | null)?.name ?? null;
  const headerName = displayName?.trim() || userName?.trim() || "User";
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const setDarkMode = useStore((s) => s.setDarkMode);
  const [showTotalSpentModal, setShowTotalSpentModal] = useState(false);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);
  const lastReceiptInsight = useStore((s) => s.lastReceiptInsight);
  const setLastReceiptInsight = useStore((s) => s.setLastReceiptInsight);
  const [summary, setSummary] = useState<{
    totalSpent: number;
    totalStores: number;
    categories: SummaryCategory[];
    needsReviewCount?: number;
    verifiedReceiptCount?: number;
  } | null>(null);
  const [recentTxs, setRecentTxs] = useState<RecentTx[]>([]);
  const [storeCount, setStoreCount] = useState(0);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getSummary(authToken);
      setSummary(data);
      if (data.displayName !== undefined || data.avatarUrl !== undefined) {
        useStore.getState().updateProfile(data.displayName ?? undefined, data.avatarUrl ?? undefined);
      }
    } catch {
      setSummary({ totalSpent: 0, totalStores: 0, categories: [], needsReviewCount: 0, verifiedReceiptCount: 0 });
    }
  }, [authToken]);

  const fetchStores = useCallback(async () => {
    try {
      const data = await getStores(authToken);
      setStoreCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setStoreCount(0);
    }
  }, [authToken]);

  const fetchRecent = useCallback(async () => {
    try {
      const data = await getReceipts(authToken);
      const list = (data ?? []).slice(0, 5).map((r: { id: string; store: { name: string }; total: number }) => ({
        id: r.id,
        store: r.store,
        total: r.total,
      }));
      setRecentTxs(list);
    } catch {
      setRecentTxs([]);
    }
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
      fetchStores();
      fetchRecent();
    }, [fetchSummary, fetchStores, fetchRecent, refreshKey])
  );

  const { bg, textPrimary, textSecondary, overlay } = getTheme(isDarkMode);

  const totalSpent = summary?.totalSpent ?? 0;
  const totalStores = summary?.totalStores ?? 0;
  const categories = summary?.categories ?? [];
  const needsReviewCount = summary?.needsReviewCount ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} style={styles.navBtn} hitSlop={12}>
            <User size={24} color={textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDarkMode(!isDarkMode)} style={styles.navBtn} hitSlop={12}>
            {isDarkMode ? <Sun size={24} color={textPrimary} /> : <Moon size={24} color={textPrimary} />}
          </TouchableOpacity>
        </View>

        <Text style={[styles.greeting, { color: textPrimary }]}>Hello, {headerName}</Text>

        {lastReceiptInsight ? (
          <GlassSurface
            isDark={isDarkMode}
            borderRadius={RADIUS.card}
            style={[LIQUID.shadow, styles.insightCardOuter]}
          >
            <View
              style={[
                styles.insightCardInner,
                {
                  borderColor:
                    lastReceiptInsight.netDelta > 0.15 ? "rgba(255,149,0,0.35)" : "rgba(52,199,89,0.35)",
                },
              ]}
            >
              <View style={styles.insightHeader}>
                <Sparkles size={20} color={IOS_BLUE} />
                <Text style={[styles.insightTitle, { color: textPrimary }]}>Smart insight</Text>
                <TouchableOpacity onPress={() => setLastReceiptInsight(null)} hitSlop={12} accessibilityLabel="Dismiss insight">
                  <X size={20} color={textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.insightHeadline, { color: textPrimary }]}>{lastReceiptInsight.headline}</Text>
              <Text style={[styles.insightSub, { color: textSecondary }]}>{lastReceiptInsight.subtext}</Text>
              {lastReceiptInsight.lines.length > 0 ? (
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  Compared {lastReceiptInsight.lines.length} line(s) · confidence {lastReceiptInsight.confidence}
                </Text>
              ) : null}
            </View>
          </GlassSurface>
        ) : null}

        {needsReviewCount > 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/modal/library?filter=needs_review")}
            accessibilityRole="button"
            accessibilityLabel={`${needsReviewCount} receipts need review before they count toward totals. Open library.`}
          >
            <GlassSurface
              isDark={isDarkMode}
              borderRadius={RADIUS.card}
              style={[LIQUID.shadow, styles.reviewBanner]}
              intensity={48}
            >
              <View style={styles.reviewBannerInner}>
                <Text style={[styles.reviewBannerTitle, { color: textPrimary }]}>
                  {needsReviewCount} receipt{needsReviewCount === 1 ? "" : "s"} not in this total
                </Text>
                <Text style={[styles.reviewBannerSub, { color: textSecondary }]}>
                  Review in Library to include them in your spending.
                </Text>
                <Text style={[styles.reviewBannerCta, { color: IOS_BLUE }]}>Open Library</Text>
              </View>
            </GlassSurface>
          </TouchableOpacity>
        ) : null}

        {/* Single hero: Total spent this period */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setShowTotalSpentModal(true)}>
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.heroCard]} intensity={52}>
            <View style={styles.heroCardInner}>
              <Text style={[styles.heroValue, { color: textPrimary }]}>
                {summary == null ? "$0.00" : `$${totalSpent.toFixed(2)}`}
              </Text>
              <Text style={[styles.heroLabel, { color: textSecondary }]}>Total spent</Text>
              <Text style={[styles.heroScope, { color: textSecondary }]}>
                Includes only verified receipts
              </Text>
            </View>
          </GlassSurface>
        </TouchableOpacity>

        {/* Supporting stat row */}
        <View style={styles.statRow}>
          <TouchableOpacity style={styles.statPillTouchable} onPress={() => router.push("/(tabs)/receipts")} activeOpacity={0.85}>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.statPillGlass]} intensity={48}>
              <View style={styles.statPillInner}>
                <Receipt size={20} color={IOS_BLUE} />
                <Text style={[styles.statValue, { color: textPrimary }]}>{recentTxs.length > 0 ? recentTxs.length : "—"}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>Recent</Text>
              </View>
            </GlassSurface>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statPillTouchable} onPress={() => router.push("/(tabs)/stores")} activeOpacity={0.85}>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.statPillGlass]} intensity={48}>
              <View style={styles.statPillInner}>
                <ShoppingBag size={20} color={IOS_BLUE} />
                <Text style={[styles.statValue, { color: textPrimary }]}>{storeCount}</Text>
                <Text style={[styles.statLabel, { color: textSecondary }]}>Stores</Text>
              </View>
            </GlassSurface>
          </TouchableOpacity>
        </View>

        <View style={styles.categoriesSection}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Categories</Text>
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.categoryBarsCard]}>
            <View style={styles.categoryBarsInner}>
              {categories.length === 0 ? (
                <Text style={[styles.categoryBarEmpty, { color: textSecondary }]}>No data</Text>
              ) : (
                categories.map((c) => (
                  <CategoryBarRow
                    key={c.name}
                    name={c.name}
                    amount={c.amount}
                    progress={c.progress}
                    textPrimary={textPrimary}
                  />
                ))
              )}
            </View>
          </GlassSurface>
        </View>

        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={[styles.recentTitle, { color: textPrimary }]}>Recent transactions</Text>
            <TouchableOpacity style={styles.seeAll} onPress={() => router.push("/(tabs)/receipts")}>
              <Text style={styles.seeAllText}>See all</Text>
              <ChevronRight size={18} color={IOS_BLUE} />
            </TouchableOpacity>
          </View>
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.txCard]}>
            {recentTxs.length === 0 ? (
              <Text style={[styles.categoryBarEmpty, { color: textSecondary, padding: SPACING.cardPadding }]}>No data</Text>
            ) : (
              recentTxs.map((tx) => (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.txRow}
                  onPress={() => router.push("/(tabs)/receipts")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIconWrap, { backgroundColor: bg }]}>
                    <Receipt size={18} color={IOS_BLUE} />
                  </View>
                  <View style={styles.txText}>
                    <Text style={[styles.txTitle, { color: textPrimary }]} numberOfLines={1}>
                      {tx.store?.name ?? "Store"}
                    </Text>
                    <Text style={[styles.txSub, { color: textSecondary }]}>${Number(tx.total).toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: textPrimary }]}>${Number(tx.total).toFixed(2)}</Text>
                </TouchableOpacity>
              ))
            )}
          </GlassSurface>
        </View>

        <TouchableOpacity
          style={styles.viewAllLink}
          onPress={() => router.push("/(tabs)/receipts")}
          activeOpacity={0.8}
        >
          <Text style={[styles.viewAllLinkText, { color: textSecondary }]}>View all receipts</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB: Add receipt */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: IOS_BLUE }, SHADOW.button]}
        onPress={() => router.push("/modal/scanner")}
        activeOpacity={0.9}
      >
        <Plus size={28} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={showTotalSpentModal} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: overlay }]}
          activeOpacity={1}
          onPress={() => setShowTotalSpentModal(false)}
        >
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.modalCard]}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Top categories</Text>
            <Text style={[styles.modalScope, { color: textSecondary }]}>
              Based on verified receipts only.
            </Text>
            {categories.length === 0 ? (
              <Text style={[styles.categoryBarEmpty, { color: textSecondary }]}>No data</Text>
            ) : (
              categories.slice(0, 3).map((c) => (
                <View key={c.name} style={styles.modalRow}>
                  <Text style={[styles.modalCat, { color: textPrimary }]}>{c.name}</Text>
                  <Text style={[styles.modalAmt, { color: textPrimary }]}>${c.amount.toFixed(2)}</Text>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowTotalSpentModal(false)}>
              <Text style={[styles.modalCloseText, { color: IOS_BLUE }]}>Done</Text>
            </TouchableOpacity>
          </GlassSurface>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 48,
    paddingBottom: 8,
  },
  navBtn: { padding: 4 },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 8,
    paddingBottom: 20,
  },
  insightCardOuter: {
    marginHorizontal: SPACING.pageHorizontal,
    marginBottom: 16,
  },
  insightCardInner: {
    padding: 16,
    borderWidth: 1,
    borderRadius: RADIUS.card,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  insightTitle: { flex: 1, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  insightHeadline: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
  insightSub: { fontSize: 14, lineHeight: 20 },
  insightMeta: { fontSize: 12, marginTop: 8 },
  reviewBanner: {
    marginHorizontal: SPACING.pageHorizontal,
    marginBottom: 12,
  },
  reviewBannerInner: { padding: 16 },
  reviewBannerTitle: { fontSize: 16, fontWeight: "700" },
  reviewBannerSub: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  reviewBannerCta: { fontSize: 15, fontWeight: "600", marginTop: 10 },
  heroCard: {
    marginHorizontal: SPACING.pageHorizontal,
  },
  heroCardInner: {
    padding: 24,
  },
  heroValue: { fontSize: 32, fontWeight: "800" },
  heroLabel: { fontSize: 14, marginTop: 4 },
  heroScope: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  statRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: SPACING.pageHorizontal,
    marginTop: 16,
  },
  statPillTouchable: { flex: 1 },
  statPillGlass: { flex: 1 },
  statPillInner: {
    padding: SPACING.cardPadding,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2 },
  categoriesSection: { paddingHorizontal: SPACING.pageHorizontal, marginTop: SPACING.sectionGap },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  categoryBarsCard: {},
  categoryBarsInner: {
    padding: SPACING.cardPadding,
  },
  categoryBarRow: { marginBottom: 12 },
  categoryBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  categoryBarName: { fontSize: 15, fontWeight: "600" },
  categoryBarAmount: { fontSize: 14, fontWeight: "700" },
  categoryBarTrack: {
    height: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  categoryBarFill: { height: "100%", backgroundColor: IOS_BLUE, borderRadius: 3 },
  categoryBarEmpty: { fontSize: 14, paddingVertical: 12 },
  recentSection: { paddingHorizontal: SPACING.pageHorizontal, marginTop: SPACING.sectionGap },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  recentTitle: { fontSize: 18, fontWeight: "600" },
  seeAll: { flexDirection: "row", alignItems: "center" },
  seeAllText: { fontSize: 14, fontWeight: "600", color: IOS_BLUE, marginRight: 2 },
  txCard: {
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: SPACING.cardPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  txText: { flex: 1, minWidth: 0 },
  txTitle: { fontSize: 15, fontWeight: "600" },
  txSub: { fontSize: 13, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "600" },
  viewAllLink: { alignSelf: "center", marginTop: 16, paddingVertical: 8 },
  viewAllLinkText: { fontSize: 14 },
  fab: {
    position: "absolute",
    bottom: 100,
    right: SPACING.pageHorizontal,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalScope: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  modalCat: { fontSize: 16, fontWeight: "500" },
  modalAmt: { fontSize: 16, fontWeight: "700" },
  modalClose: { marginTop: 16, alignItems: "center" },
  modalCloseText: { fontSize: 16, fontWeight: "600" },
});
