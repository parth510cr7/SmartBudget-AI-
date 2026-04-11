import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, LIQUID } from "../../src/theme";
import { createPrivatePriceShare, type CreatePrivatePriceSharePayload } from "../../src/api/client";

const SCOPES: { value: CreatePrivatePriceSharePayload["shareScope"]; label: string }[] = [
  { value: "ALL", label: "All my prices" },
  { value: "STORE", label: "By store" },
  { value: "ITEM", label: "By item" },
  { value: "CATEGORY", label: "By category" },
  { value: "DATE_RANGE", label: "By date range" },
];

export default function PriceHistorySharingModal() {
  const router = useRouter();
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const [targetUserId, setTargetUserId] = useState("");
  const [scope, setScope] = useState<CreatePrivatePriceSharePayload["shareScope"]>("ALL");
  const [submitting, setSubmitting] = useState(false);

  const handleShare = async () => {
    const id = targetUserId.trim();
    if (!id) {
      Alert.alert("Missing user ID", "Enter the other person's SmartBudget user ID (they can find it in their Profile).");
      return;
    }
    setSubmitting(true);
    try {
      await createPrivatePriceShare(authToken, { targetUserId: id, shareScope: scope });
      Alert.alert("Shared", "Price history share created. They can see your prices when finalizing a basket.");
      setTargetUserId("");
    } catch (e) {
      Alert.alert("Could not share", e instanceof Error ? e.message : "Failed to create share.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={[styles.title, { color: textPrimary }]}>Price history sharing</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <X size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.paragraph, { color: textSecondary }]}>
          Share your receipt-based price history with another SmartBudget user. They will see your prices when finalizing a basket. You need their SmartBudget user ID (they can find it in their Profile).
        </Text>
        <Text style={[styles.label, { color: textSecondary }]}>Their user ID</Text>
        <GlassSurface isDark={isDarkMode} borderRadius={12} style={[LIQUID.shadow, styles.inputGlass]}>
          <TextInput
            style={[styles.input, { color: textPrimary }]}
            placeholder="e.g. abc123..."
            placeholderTextColor={textSecondary}
            value={targetUserId}
            onChangeText={setTargetUserId}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </GlassSurface>
        <Text style={[styles.label, { color: textSecondary }]}>Scope</Text>
        <View style={styles.scopeRow}>
          {SCOPES.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.scopeChip, scope === s.value && { backgroundColor: IOS_BLUE }]}
              onPress={() => setScope(s.value)}
            >
              <Text style={[styles.scopeChipText, { color: scope === s.value ? "#FFF" : textPrimary }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: IOS_BLUE }]}
          onPress={handleShare}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.shareBtnText}>Share with this user</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  paragraph: { fontSize: 16, lineHeight: 24, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  inputGlass: { marginBottom: 20 },
  input: { height: 48, paddingHorizontal: 14, fontSize: 16 },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  scopeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  scopeChipText: { fontSize: 14, fontWeight: "500" },
  shareBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", minHeight: 48 },
  shareBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});
