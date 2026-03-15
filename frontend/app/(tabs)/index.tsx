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
} from "lucide-react-native";
import { getSummary, getReceipts, getStores, type SummaryCategory } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE, SPACING, RADIUS, SHADOW } from "../../src/theme";

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
  const [summary, setSummary] = useState<{
    totalSpent: number;
    totalStores: number;
    categories: SummaryCategory[];
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
      setSummary({ totalSpent: 0, totalStores: 0, categories: [] });
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

  const { bg, glass, textPrimary, textSecondary, overlay } = getTheme(isDarkMode);

  const totalSpent = summary?.totalSpent ?? 0;
  const totalStores = summary?.totalStores ?? 0;
  const categories = summary?.categories ?? [];

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

        {/* Single hero: Total spent this period */}
        <TouchableOpacity
          style={[styles.heroCard, { backgroundColor: glass }, SHADOW.card]}
          activeOpacity={0.8}
          onPress={() => setShowTotalSpentModal(true)}
        >
          <Text style={[styles.heroValue, { color: textPrimary }]}>
            {summary == null ? "$0.00" : `$${totalSpent.toFixed(2)}`}
          </Text>
          <Text style={[styles.heroLabel, { color: textSecondary }]}>Total spent</Text>
        </TouchableOpacity>

        {/* Supporting stat row */}
        <View style={styles.statRow}>
          <TouchableOpacity
            style={[styles.statPill, { backgroundColor: glass }]}
            onPress={() => router.push("/(tabs)/receipts")}
            activeOpacity={0.8}
          >
            <Receipt size={20} color={IOS_BLUE} />
            <Text style={[styles.statValue, { color: textPrimary }]}>{recentTxs.length > 0 ? recentTxs.length : "—"}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statPill, { backgroundColor: glass }]}
            onPress={() => router.push("/(tabs)/stores")}
            activeOpacity={0.8}
          >
            <ShoppingBag size={20} color={IOS_BLUE} />
            <Text style={[styles.statValue, { color: textPrimary }]}>{storeCount}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]}>Stores</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.categoriesSection}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Categories</Text>
          <View style={[styles.categoryBarsCard, { backgroundColor: glass }]}>
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
        </View>

        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={[styles.recentTitle, { color: textPrimary }]}>Recent transactions</Text>
            <TouchableOpacity style={styles.seeAll} onPress={() => router.push("/(tabs)/receipts")}>
              <Text style={styles.seeAllText}>See all</Text>
              <ChevronRight size={18} color={IOS_BLUE} />
            </TouchableOpacity>
          </View>
          <View style={[styles.txCard, { backgroundColor: glass }, SHADOW.card]}>
            {recentTxs.length === 0 ? (
              <Text style={[styles.categoryBarEmpty, { color: textSecondary }]}>No data</Text>
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
          </View>
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
          <View style={[styles.modalCard, { backgroundColor: glass }]}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Top categories</Text>
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
          </View>
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
  heroCard: {
    marginHorizontal: SPACING.pageHorizontal,
    borderRadius: RADIUS.card,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  heroValue: { fontSize: 32, fontWeight: "800" },
  heroLabel: { fontSize: 14, marginTop: 4 },
  statRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: SPACING.pageHorizontal,
    marginTop: 16,
  },
  statPill: {
    flex: 1,
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statValue: { fontSize: 20, fontWeight: "700", marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2 },
  categoriesSection: { paddingHorizontal: SPACING.pageHorizontal, marginTop: SPACING.sectionGap },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  categoryBarsCard: {
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
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
    borderRadius: RADIUS.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
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
    borderRadius: RADIUS.card,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  modalCat: { fontSize: 16, fontWeight: "500" },
  modalAmt: { fontSize: 16, fontWeight: "700" },
  modalClose: { marginTop: 16, alignItems: "center" },
  modalCloseText: { fontSize: 16, fontWeight: "600" },
});
