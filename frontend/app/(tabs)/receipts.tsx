import { useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Store, Trash2, Info } from "lucide-react-native";
import { getTransactions, deleteTransaction, getReceiptDebug } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";
import { getLocalTransactions, saveLocalTransactions } from "../../src/lib/localDb";

type TxRow = {
  id: string;
  date: string;
  total: number;
  imageUrl: string | null;
  store: { name: string };
  items?: { category: string }[];
  status?: string;
};

function formatDate(d: string): string {
  try {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

/** "YYYY-MM" for grouping and filtering. */
function getMonthYearKey(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

/** "March 2026" for display. */
function getMonthYearLabel(key: string): string {
  if (!key || key === "all") return "All";
  const [y, m] = key.split("-");
  const monthNum = parseInt(m, 10);
  const date = new Date(parseInt(y, 10), monthNum - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Unique month/year keys from transactions, newest first. */
function getMonthYearOptions(transactions: TxRow[]): { value: string; label: string }[] {
  const keys = new Set<string>();
  transactions.forEach((r) => {
    const k = getMonthYearKey(r.date);
    if (k) keys.add(k);
  });
  const sorted = Array.from(keys).sort((a, b) => b.localeCompare(a));
  const options: { value: string; label: string }[] = [{ value: "all", label: "All" }];
  sorted.forEach((k) => options.push({ value: k, label: getMonthYearLabel(k) }));
  return options;
}

function firstCategory(items: { category: string }[] | undefined): string {
  if (!items?.length) return "Other";
  return items[0].category ?? "Other";
}

export default function ReceiptsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ store?: string }>();
  const storeFilter = typeof params.store === "string" ? params.store.trim() : "";
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);
  const [selectedMonthYear, setSelectedMonthYear] = useState("all");
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [lastParsed, setLastParsed] = useState<Awaited<ReturnType<typeof getReceiptDebug>>>(null);
  const triggerDashboardRefresh = useStore((s) => s.triggerDashboardRefresh);

  const handleDeleteReceipt = useCallback(
    (r: TxRow) => {
      Alert.alert(
        "Delete receipt",
        `Remove "${r.store?.name ?? "Store"}" ($${Number(r.total).toFixed(2)})? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteTransaction(r.id, "all", authToken);
                triggerDashboardRefresh();
                const data = await getTransactions(authToken);
                const list = data ?? [];
                saveLocalTransactions(list);
                setTransactions(list);
                useStore.getState().setTransactions(list);
              } catch (e) {
                Alert.alert("Error", e instanceof Error ? e.message : "Delete failed");
              }
            },
          },
        ]
      );
    },
    [authToken, triggerDashboardRefresh]
  );

  useFocusEffect(
    useCallback(() => {
      getLocalTransactions().then((local) => {
        const list = (local ?? []) as TxRow[];
        setTransactions(list);
        useStore.getState().setTransactions(list);
      });
      getTransactions(authToken)
        .then((data) => {
          const raw = Array.isArray(data) ? data : [];
          const list: TxRow[] = raw.map((r: Record<string, unknown>) => {
            const dateVal = r.date ?? r.createdAt;
            const dateStr =
              typeof dateVal === "string"
                ? dateVal
                : dateVal instanceof Date
                  ? dateVal.toISOString()
                  : new Date().toISOString();
            return {
              id: String(r.id ?? ""),
              date: dateStr,
              total: typeof r.total === "number" ? r.total : 0,
              imageUrl: (r.imageUrl as string | null) ?? null,
              store: (r.store as { name: string }) ?? { name: "Store" },
              items: r.items as { category: string }[] | undefined,
              status: typeof r.status === "string" ? r.status : undefined,
            };
          });
          saveLocalTransactions(list);
          setTransactions(list);
          useStore.getState().setTransactions(list);
        })
        .catch(() => {
          setTransactions([]);
          useStore.getState().setTransactions([]);
        });
      getReceiptDebug(authToken).then(setLastParsed).catch(() => setLastParsed(null));
    }, [authToken, refreshKey])
  );

  const filteredTransactions = useMemo(() => {
    if (!storeFilter) return transactions;
    const name = storeFilter.toLowerCase();
    return transactions.filter((t) => (t.store?.name ?? "").toLowerCase() === name);
  }, [transactions, storeFilter]);

  const monthYearOptions = useMemo(() => getMonthYearOptions(filteredTransactions), [filteredTransactions]);

  /** When a specific month is selected, list MUST only show receipts from that month. Compare transaction date (YYYY-MM) to selectedMonthYear. */
  const filteredAndSorted = useMemo(() => {
    let list = filteredTransactions;
    if (selectedMonthYear !== "all") {
      list = filteredTransactions.filter((r) => {
        const txKey = getMonthYearKey(r.date);
        return txKey === selectedMonthYear;
      });
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredTransactions, selectedMonthYear]);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.header, { color: textPrimary }]}>
          {storeFilter ? `Receipts · ${storeFilter}` : "Transaction History"}
        </Text>

        {lastParsed && (lastParsed.storeName ?? lastParsed.chosenTotal != null) && (
          <TouchableOpacity
            style={[styles.lastParsedCard, { backgroundColor: glass }]}
            onPress={() => {
              const items = lastParsed.items ?? [];
              const lines = items.length
                ? items.map((i) => `${i.name} — $${Number(i.totalPrice).toFixed(2)}`).join("\n")
                : "No line items.";
              Alert.alert(
                "Last parsed receipt",
                `Store: ${lastParsed.storeName ?? "—"}\nTotal: $${Number(lastParsed.chosenTotal ?? 0).toFixed(2)}\nItems: ${lastParsed.itemCount ?? 0}\nSource: ${lastParsed.extractionSource ?? "—"}\n\n${lines}`,
                [{ text: "OK" }]
              );
            }}
            activeOpacity={0.8}
          >
            <Info size={18} color={IOS_BLUE} style={styles.lastParsedIcon} />
            <Text style={[styles.lastParsedLabel, { color: textSecondary }]}>Last parsed</Text>
            <Text style={[styles.lastParsedValue, { color: textPrimary }]}>
              {lastParsed.storeName ?? "Store"} · ${Number(lastParsed.chosenTotal ?? 0).toFixed(2)} · {lastParsed.itemCount ?? 0} items
            </Text>
          </TouchableOpacity>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {monthYearOptions.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[styles.chip, { backgroundColor: glass }, selectedMonthYear === value && styles.chipActive]}
              onPress={() => setSelectedMonthYear(value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: textPrimary }, selectedMonthYear === value && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.cardList}>
          {filteredAndSorted.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <Text style={[styles.emptyStateText, { color: textSecondary }]}>
                {filteredTransactions.length === 0
                  ? (storeFilter ? `No receipts for "${storeFilter}".` : "No Data")
                  : "No receipts found for this month."}
              </Text>
            </View>
          ) : (
            filteredAndSorted.map((r) => (
              <View key={r.id} style={[styles.receiptCard, { backgroundColor: glass }]}>
                <TouchableOpacity style={styles.receiptCardMain} activeOpacity={0.8}>
                  <View style={[styles.receiptIconWrap, { backgroundColor: bg }]}>
                    <Store size={24} color={IOS_BLUE} />
                  </View>
                  <View style={styles.receiptBody}>
                    <Text style={[styles.receiptStore, { color: textPrimary }]}>{r.store?.name ?? "Store"}</Text>
                    <Text style={[styles.receiptMeta, { color: textSecondary }]}>
                      {formatDate(r.date)} · {firstCategory(r.items)}
                    </Text>
                    {r.status === "NEEDS_REVIEW" ? (
                      <Text style={[styles.receiptMeta, { color: "#FF9500", fontWeight: "700" }]}>Review needed</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.receiptTotal, { color: textPrimary }]}>${Number(r.total).toFixed(2)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtn, { backgroundColor: bg }]}
                  onPress={() => handleDeleteReceipt(r)}
                  hitSlop={12}
                >
                  <Trash2 size={20} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  IOS_BG: { backgroundColor: "#F2F2F7" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 120 },
  header: { fontSize: 34, fontWeight: "800", marginBottom: 20 },
  lastParsedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  lastParsedIcon: { marginRight: 8 },
  lastParsedLabel: { fontSize: 12, marginRight: 6 },
  lastParsedValue: { fontSize: 15, fontWeight: "600", flex: 1 },
  chipsScroll: { marginHorizontal: -20 },
  chipsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 24 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  chipActive: { backgroundColor: IOS_BLUE, borderColor: IOS_BLUE },
  chipText: { fontSize: 15, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  cardList: { gap: 12 },
  noData: { fontSize: 14, paddingVertical: 12 },
  emptyStateWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 48 },
  emptyStateText: { fontSize: 16, textAlign: "center" },
  receiptCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    overflow: "hidden",
  },
  receiptCardMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    padding: 16,
  },
  deleteBtn: {
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  receiptIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  receiptBody: { flex: 1 },
  receiptStore: { fontSize: 17, fontWeight: "700" },
  receiptMeta: { fontSize: 13, marginTop: 2 },
  receiptTotal: { fontSize: 17, fontWeight: "700" },
});
