import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Camera, FolderOpen, ImageUp } from "lucide-react-native";
import { getSummary, getReceipts } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE, SPACING, RADIUS } from "../../src/theme";

type ReceiptRow = { id: string; store?: { name?: string }; total: number; date?: string; createdAt?: string };

export default function ScanScreen() {
  const router = useRouter();
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([]);
  const [scanStats, setScanStats] = useState<{ thisMonth: number; lastScanAt: string | null }>({ thisMonth: 0, lastScanAt: null });

  const fetchReceipts = useCallback(async () => {
    try {
      const data = await getReceipts(authToken);
      const list = (data ?? []) as { id: string; store?: { name?: string }; total: number; date?: string; createdAt?: string }[];
      const rows: ReceiptRow[] = list.slice(0, 10).map((r) => ({
        id: r.id,
        store: r.store,
        total: r.total,
        date: r.date ?? r.createdAt,
      }));
      setRecentReceipts(rows);

      const now = new Date();
      const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const getDate = (r: { date?: string; createdAt?: string }) => r.date ?? r.createdAt;
      const thisMonthCount = list.filter((r) => {
        const raw = getDate(r);
        const d = raw ? new Date(raw).getTime() : 0;
        return d >= firstDayThisMonth;
      }).length;
      const sorted = [...list].sort((a, b) => {
        const da = getDate(a) ? new Date(getDate(a)!).getTime() : 0;
        const db = getDate(b) ? new Date(getDate(b)!).getTime() : 0;
        return db - da;
      });
      const lastScanAt = sorted[0] ? (getDate(sorted[0]) ? new Date(getDate(sorted[0])!).toLocaleDateString() : null) : null;
      setScanStats({ thisMonth: thisMonthCount, lastScanAt });
    } catch {
      setRecentReceipts([]);
      setScanStats({ thisMonth: 0, lastScanAt: null });
    }
  }, [authToken]);

  const refreshKey = useStore((s) => s.refreshKey ?? 0);
  useFocusEffect(
    useCallback(() => {
      fetchReceipts();
    }, [fetchReceipts, refreshKey])
  );

  const openScanner = () => router.push("/modal/scanner");
  const openScannerGallery = () => router.push("/modal/scanner?source=gallery" as const);
  const openLibrary = () => router.push("/modal/library");

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.header, { color: textPrimary }]}>Scan</Text>

      {/* Primary: New Scan */}
      <TouchableOpacity style={styles.primaryBtn} onPress={openScanner} activeOpacity={0.8}>
        <Camera size={32} color="#FFF" />
        <Text style={styles.primaryBtnText}>New Scan</Text>
      </TouchableOpacity>

      {/* Secondary: Upload from Photos */}
      <TouchableOpacity
        style={[styles.secondaryBtn, { backgroundColor: glass }]}
        onPress={openScannerGallery}
        activeOpacity={0.8}
      >
        <ImageUp size={24} color={IOS_BLUE} />
        <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>Upload from Photos</Text>
      </TouchableOpacity>

      {/* Library */}
      <TouchableOpacity
        style={[styles.libraryBtn, { backgroundColor: glass }]}
        onPress={openLibrary}
        activeOpacity={0.8}
      >
        <FolderOpen size={22} color={IOS_BLUE} />
        <View style={styles.libraryBtnTextWrap}>
          <Text style={[styles.libraryBtnText, { color: textPrimary }]}>Library</Text>
          <Text style={[styles.libraryHint, { color: textSecondary }]}>View all uploads</Text>
        </View>
      </TouchableOpacity>

      {/* Recent scans strip */}
      <Text style={[styles.sectionTitle, { color: textPrimary }]}>Recent scans</Text>
      {recentReceipts.length === 0 ? (
        <Text style={[styles.emptyText, { color: textSecondary }]}>No scans yet. Tap New Scan or Upload from Photos.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentStrip}
        >
          {recentReceipts.slice(0, 5).map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.recentCard, { backgroundColor: glass }]}
              onPress={openLibrary}
              activeOpacity={0.8}
            >
              <Text style={[styles.recentStore, { color: textPrimary }]} numberOfLines={1}>
                {r.store?.name ?? "Receipt"}
              </Text>
              <Text style={[styles.recentTotal, { color: IOS_BLUE }]}>${Number(r.total).toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Scan-derived stats (no category rings from Home) */}
      <Text style={[styles.sectionTitle, { color: textPrimary }]}>From your scans</Text>
      <View style={[styles.statsCard, { backgroundColor: glass }]}>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: textSecondary }]}>Receipts this month</Text>
          <Text style={[styles.statValue, { color: textPrimary }]}>{scanStats.thisMonth}</Text>
        </View>
        <View style={[styles.statRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" }]}>
          <Text style={[styles.statLabel, { color: textSecondary }]}>Last scan</Text>
          <Text style={[styles.statValue, { color: textPrimary }]}>{scanStats.lastScanAt ?? "—"}</Text>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: SPACING.pageHorizontal, paddingTop: 56, paddingBottom: 24 },
  header: { fontSize: 28, fontWeight: "800", marginBottom: 24 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: IOS_BLUE,
    paddingVertical: 20,
    borderRadius: RADIUS.card,
    marginBottom: 12,
  },
  primaryBtnText: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: RADIUS.card,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  secondaryBtnText: { fontSize: 17, fontWeight: "600" },
  libraryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.card,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  libraryBtnTextWrap: { marginLeft: 14 },
  libraryBtnText: { fontSize: 17, fontWeight: "600" },
  libraryHint: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  emptyText: { fontSize: 14, paddingVertical: 12 },
  recentStrip: { flexDirection: "row", gap: 12, paddingVertical: 8 },
  recentCard: {
    width: 140,
    borderRadius: RADIUS.card,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  recentStore: { fontSize: 14, fontWeight: "600" },
  recentTotal: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  statsCard: {
    borderRadius: RADIUS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  statLabel: { fontSize: 14 },
  statValue: { fontSize: 16, fontWeight: "600" },
});
