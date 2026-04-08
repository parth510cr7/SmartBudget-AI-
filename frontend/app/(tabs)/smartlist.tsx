import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ListChecks, ChevronRight, Search, Trash2 } from "lucide-react-native";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE, IOS_GREEN, IOS_RED } from "../../src/theme";
import { getSmartLists, deleteSmartList, type SmartListRow } from "../../src/api/client";

export default function SmartListScreen() {
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const setBasket = useStore((s) => s.setBasket);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const router = useRouter();
  const [lists, setLists] = useState<SmartListRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSmartLists(authToken ?? null);
      setLists(Array.isArray(data) ? data : []);
    } catch {
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function loadIntoBasket(list: SmartListRow) {
    const names = list.items.map((i) => i.name.trim()).filter(Boolean);
    setBasket(names.length > 0 ? names : []);
    router.push({ pathname: "/(tabs)/search", params: { freshBasket: "1" } });
  }

  function confirmDelete(list: SmartListRow) {
    Alert.alert("Delete saved basket", `Remove "${list.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSmartList(authToken ?? null, list.id);
            setLists((prev) => prev.filter((x) => x.id !== list.id));
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not delete");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: textPrimary }]}>Saved lists</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>
        Lists you saved from Search → your basket → Save. Tap a row to load it into your basket and open Search, or use
        the button below for Load saved and Finalize.
      </Text>

      <TouchableOpacity
        style={[styles.linkRow, { backgroundColor: glass, borderColor: "rgba(255,255,255,0.5)" }]}
        onPress={() => router.push("/(tabs)/search")}
        activeOpacity={0.8}
      >
        <Search size={22} color={IOS_BLUE} />
        <View style={styles.linkTextWrap}>
          <Text style={[styles.linkTitle, { color: textPrimary }]}>Search</Text>
          <Text style={[styles.linkSub, { color: textSecondary }]}>Load saved, add items, Finalize</Text>
        </View>
        <ChevronRight size={22} color={textSecondary} />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="small" color={IOS_BLUE} style={styles.spinner} />
      ) : lists.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: glass }]}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>
            No saved lists yet. On the Search tab, add items to your basket and tap Save.
          </Text>
        </View>
      ) : (
        lists.map((list) => (
          <View key={list.id} style={[styles.listRow, { backgroundColor: glass, borderColor: "rgba(255,255,255,0.5)" }]}>
            <TouchableOpacity style={styles.listRowMain} onPress={() => loadIntoBasket(list)} activeOpacity={0.8}>
              <ListChecks size={20} color={IOS_BLUE} />
              <View style={styles.listTextWrap}>
                <Text style={[styles.listName, { color: textPrimary }]} numberOfLines={1}>
                  {list.name}
                </Text>
                {list.estimatedTotalSnapshot != null &&
                typeof list.estimatedTotalSnapshot === "number" &&
                Number.isFinite(list.estimatedTotalSnapshot) ? (
                  <Text style={styles.listEstimate}>Est. ${list.estimatedTotalSnapshot.toFixed(2)}</Text>
                ) : null}
                <Text style={[styles.listMeta, { color: textSecondary }]}>
                  {list.items.length} item{list.items.length === 1 ? "" : "s"} · Tap to load basket
                </Text>
              </View>
              <ChevronRight size={20} color={textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={`Delete ${list.name}`}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => confirmDelete(list)}
              style={styles.listDeleteBtn}
            >
              <Trash2 size={18} color={IOS_RED} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  linkTextWrap: { flex: 1 },
  linkTitle: { fontSize: 16, fontWeight: "600" },
  linkSub: { fontSize: 13, marginTop: 2 },
  spinner: { marginTop: 24 },
  emptyCard: { padding: 20, borderRadius: 16 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  listRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 8,
    gap: 4,
  },
  listDeleteBtn: { paddingVertical: 16, paddingRight: 16, paddingLeft: 4, justifyContent: "center" },
  listTextWrap: { flex: 1, marginLeft: 12 },
  listName: { fontSize: 16, fontWeight: "600" },
  listEstimate: { fontSize: 12, fontWeight: "600", marginTop: 4, color: IOS_GREEN },
  listMeta: { fontSize: 13, marginTop: 4 },
});
