import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter, useFocusEffect } from "expo-router";
import { Home, Users, Link as LinkIcon, LogOut, Trash2, X } from "lucide-react-native";
import { useStore } from "../src/store/useStore";
import { getTheme, IOS_BLUE, IOS_RED, SPACING, RADIUS } from "../src/theme";
import {
  getMyHousehold,
  createHousehold,
  createHouseholdInvite,
  joinHousehold,
  leaveHousehold,
  removeHouseholdMember,
  getHouseholdMembers,
  getHouseholdDashboard,
  type HouseholdDashboardResponse,
  type HouseholdMembersResponse,
} from "../src/api/client";

function parseToken(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";
  // accept raw token or a URL ending with /join/<token>
  const match = s.match(/\/join\/([a-f0-9]{16,64})/i);
  if (match?.[1]) return match[1];
  return s;
}

export default function HouseholdScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Awaited<ReturnType<typeof getMyHousehold>> | null>(null);
  const [members, setMembers] = useState<HouseholdMembersResponse | null>(null);
  const [dash, setDash] = useState<HouseholdDashboardResponse | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  const [inviteBusy, setInviteBusy] = useState(false);

  const household = me?.household ?? null;
  const isOwner = household?.role === "owner";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const h = await getMyHousehold(authToken ?? null);
      setMe(h);
      if (h.household) {
        const [m, d] = await Promise.all([getHouseholdMembers(authToken ?? null), getHouseholdDashboard(authToken ?? null)]);
        setMembers(m);
        setDash(d);
      } else {
        setMembers(null);
        setDash(null);
      }
    } catch (e) {
      setMe({ household: null });
      setMembers(null);
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const memberCount = members?.members?.length ?? 0;
  const maxMembers = members?.household?.maxMembers ?? household?.maxMembers ?? 5;

  const topCategories = useMemo(() => (dash?.categoryTotals ?? []).slice(0, 6), [dash?.categoryTotals]);
  const topStores = useMemo(() => (dash?.storeTotals ?? []).slice(0, 6), [dash?.storeTotals]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={IOS_BLUE} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.backText, { color: IOS_BLUE }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Household</Text>
        <View style={{ width: 48 }} />
      </View>

      {!household ? (
        <View style={[styles.card, { backgroundColor: glass }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>One roof, shared receipts</Text>
          <Text style={[styles.cardSub, { color: textSecondary }]}>
            Create a household (max 5 people) so everyone can contribute shared receipts. Each receipt can still be saved as Personal or Household.
          </Text>

          <View style={{ height: 12 }} />
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: IOS_BLUE }]} onPress={() => setCreateOpen(true)} activeOpacity={0.85}>
            <Home size={18} color="#FFF" />
            <Text style={styles.primaryBtnText}>Create household</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: textSecondary }]} onPress={() => setJoinOpen(true)} activeOpacity={0.85}>
            <Users size={18} color={textPrimary} />
            <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>Join with invite link/token</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: glass }]}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>{household.name}</Text>
            <Text style={[styles.cardSub, { color: textSecondary }]}>{isOwner ? "Owner" : "Member"} · {memberCount}/{maxMembers} members</Text>

            <View style={styles.metricsRow}>
              <View style={[styles.metric, { backgroundColor: bg }]}>
                <Text style={[styles.metricLabel, { color: textSecondary }]}>Total spend</Text>
                <Text style={[styles.metricValue, { color: textPrimary }]}>${Number(dash?.totals?.totalSpend ?? 0).toFixed(2)}</Text>
              </View>
            </View>

            <View style={{ height: 10 }} />
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: textSecondary }]}
              onPress={async () => {
                if (!isOwner) {
                  Alert.alert("Invite", "Only the household owner can create invite links.");
                  return;
                }
                setInviteBusy(true);
                try {
                  const inv = await createHouseholdInvite(authToken ?? null);
                  await Clipboard.setStringAsync(inv.inviteUrl);
                  Alert.alert("Invite link copied", "Share it with your household member to join.");
                } catch (e) {
                  Alert.alert("Invite", e instanceof Error ? e.message : "Could not create invite");
                } finally {
                  setInviteBusy(false);
                }
              }}
              disabled={inviteBusy}
              activeOpacity={0.85}
            >
              <LinkIcon size={18} color={textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>{inviteBusy ? "Creating..." : "Copy invite link"}</Text>
            </TouchableOpacity>

            {!isOwner && (
              <TouchableOpacity
                style={[styles.leaveBtn, { borderColor: "rgba(255,59,48,0.35)" }]}
                onPress={() => {
                  Alert.alert("Leave household", "You’ll stop seeing shared household analytics. Your past shared receipts stay in the household.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Leave",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await leaveHousehold(authToken ?? null);
                          refresh();
                        } catch (e) {
                          Alert.alert("Error", e instanceof Error ? e.message : "Could not leave");
                        }
                      },
                    },
                  ]);
                }}
                activeOpacity={0.85}
              >
                <LogOut size={18} color={IOS_RED} />
                <Text style={[styles.leaveText, { color: IOS_RED }]}>Leave household</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: glass }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Members</Text>
            {(members?.members ?? []).map((m) => (
              <View key={m.userId} style={[styles.row, { borderBottomColor: bg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: textPrimary }]} numberOfLines={1}>{m.name}</Text>
                  <Text style={[styles.rowSub, { color: textSecondary }]}>{m.role}</Text>
                </View>
                {isOwner && m.role !== "owner" && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert("Remove member", "Remove this person from your household?", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await removeHouseholdMember(authToken ?? null, m.userId);
                              refresh();
                            } catch (e) {
                              Alert.alert("Error", e instanceof Error ? e.message : "Could not remove");
                            }
                          },
                        },
                      ]);
                    }}
                    hitSlop={10}
                  >
                    <Trash2 size={18} color={IOS_RED} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {(members?.members?.length ?? 0) === 0 && (
              <Text style={[styles.emptyText, { color: textSecondary }]}>No members yet.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: glass }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Top categories</Text>
            {topCategories.length === 0 ? (
              <Text style={[styles.emptyText, { color: textSecondary }]}>No shared receipts yet.</Text>
            ) : (
              topCategories.map((c) => (
                <View key={c.category} style={[styles.row, { borderBottomColor: bg }]}>
                  <Text style={[styles.rowTitle, { color: textPrimary }]}>{c.category}</Text>
                  <Text style={[styles.rowTitle, { color: textPrimary }]}>${Number(c.total).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.card, { backgroundColor: glass }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Top stores</Text>
            {topStores.length === 0 ? (
              <Text style={[styles.emptyText, { color: textSecondary }]}>No shared receipts yet.</Text>
            ) : (
              topStores.map((s) => (
                <View key={s.storeId} style={[styles.row, { borderBottomColor: bg }]}>
                  <Text style={[styles.rowTitle, { color: textPrimary }]} numberOfLines={1}>{s.storeName}</Text>
                  <Text style={[styles.rowTitle, { color: textPrimary }]}>${Number(s.total).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.card, { backgroundColor: glass }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Recent shared receipts</Text>
            {(dash?.recentReceipts ?? []).length === 0 ? (
              <Text style={[styles.emptyText, { color: textSecondary }]}>No shared receipts yet.</Text>
            ) : (
              (dash?.recentReceipts ?? []).slice(0, 10).map((r) => (
                <View key={r.id} style={[styles.row, { borderBottomColor: bg }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: textPrimary }]} numberOfLines={1}>{r.store.name}</Text>
                    <Text style={[styles.rowSub, { color: textSecondary }]} numberOfLines={1}>
                      Uploaded by {r.uploadedBy.name} · {new Date(r.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.rowTitle, { color: textPrimary }]}>${Number(r.total).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>
        </>
      )}

      {/* Create modal */}
      <Modal visible={createOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: glass }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>Create household</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)} hitSlop={12}>
                <X size={22} color={textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: bg, color: textPrimary }]}
              placeholder="Household name (e.g. The Patels)"
              placeholderTextColor={textSecondary}
              value={createName}
              onChangeText={setCreateName}
              editable={!createBusy}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: IOS_BLUE, marginTop: 12 }]}
              onPress={async () => {
                const name = createName.trim();
                if (!name) return Alert.alert("Missing", "Enter a household name.");
                setCreateBusy(true);
                try {
                  await createHousehold(authToken ?? null, name);
                  setCreateOpen(false);
                  setCreateName("");
                  refresh();
                } catch (e) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Could not create");
                } finally {
                  setCreateBusy(false);
                }
              }}
              disabled={createBusy}
              activeOpacity={0.85}
            >
              {createBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryBtnText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join modal */}
      <Modal visible={joinOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: glass }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textPrimary }]}>Join household</Text>
              <TouchableOpacity onPress={() => setJoinOpen(false)} hitSlop={12}>
                <X size={22} color={textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: bg, color: textPrimary }]}
              placeholder="Paste invite link or token"
              placeholderTextColor={textSecondary}
              value={joinValue}
              onChangeText={setJoinValue}
              editable={!joinBusy}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: IOS_BLUE, marginTop: 12 }]}
              onPress={async () => {
                const token = parseToken(joinValue);
                if (!token) return Alert.alert("Missing", "Paste a valid invite token or link.");
                setJoinBusy(true);
                try {
                  await joinHousehold(authToken ?? null, token);
                  setJoinOpen(false);
                  setJoinValue("");
                  refresh();
                } catch (e) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Could not join");
                } finally {
                  setJoinBusy(false);
                }
              }}
              disabled={joinBusy}
              activeOpacity={0.85}
            >
              {joinBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryBtnText}>Join</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: SPACING.pageHorizontal, paddingTop: 56, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  backText: { fontSize: 16, fontWeight: "600" },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  card: {
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    marginBottom: SPACING.sectionGap,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  cardSub: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { paddingVertical: 14, borderRadius: RADIUS.button, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { marginTop: 10, paddingVertical: 14, borderRadius: RADIUS.button, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, borderWidth: 1 },
  secondaryBtnText: { fontSize: 16, fontWeight: "700" },
  leaveBtn: { marginTop: 12, paddingVertical: 12, borderRadius: RADIUS.button, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, borderWidth: 1 },
  leaveText: { fontSize: 15, fontWeight: "700" },
  metricsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  metric: { flex: 1, borderRadius: 12, padding: 12 },
  metricLabel: { fontSize: 12, fontWeight: "600" },
  metricValue: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowSub: { fontSize: 12 },
  emptyText: { fontSize: 13, paddingVertical: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: RADIUS.card, padding: SPACING.cardPadding },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  input: { borderRadius: 10, padding: 14, fontSize: 16 },
});

