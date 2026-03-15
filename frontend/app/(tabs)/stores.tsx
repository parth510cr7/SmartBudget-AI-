import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Store } from "lucide-react-native";
import { getStores } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";

export default function StoresScreen() {
  const router = useRouter();
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);
  const [stores, setStores] = useState<{ name: string; visits: number; totalSpent: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      getStores(authToken)
        .then((data) => setStores(Array.isArray(data) ? data : []))
        .catch(() => setStores([]));
    }, [authToken, refreshKey])
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Your Stores</Text>

        <View style={styles.cardList}>
          {stores.length === 0 ? (
            <Text style={styles.noData}>No Data</Text>
          ) : (
            stores.map((s) => (
              <View key={s.name} style={styles.storeCard}>
                <View style={styles.storeRow}>
                  <View style={styles.storeIconWrap}>
                    <Store size={28} color={IOS_BLUE} />
                  </View>
                  <View style={styles.storeBody}>
                    <Text style={styles.storeName}>{s.name}</Text>
                    <Text style={styles.storeMeta}>Total Visited: {s.visits} times</Text>
                    <Text style={styles.storeSpent}>Total Spent: ${Number(s.totalSpent).toFixed(2)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.viewReceiptsBtn}
                  onPress={() => router.push("/(tabs)/receipts")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewReceiptsText}>View Receipts</Text>
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
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 120 },
  header: { fontSize: 34, fontWeight: "800", marginBottom: 24 },
  cardList: { gap: 16 },
  noData: { fontSize: 14, paddingVertical: 12 },
  storeCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  storeRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  storeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  storeBody: { flex: 1 },
  storeName: { fontSize: 20, fontWeight: "700" },
  storeMeta: { fontSize: 14, marginTop: 4 },
  storeSpent: { fontSize: 15, fontWeight: "600", marginTop: 2 },
  viewReceiptsBtn: { alignSelf: "flex-start" },
  viewReceiptsText: { fontSize: 16, fontWeight: "600", color: IOS_BLUE },
});
