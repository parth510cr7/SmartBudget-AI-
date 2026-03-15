import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Share, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { getGroups, getBalancesForUser, createGroupInviteLink } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";

const DEEP_CHOCOLATE = "#3B2818";
const WARM_CARAMEL = "#C68E58";
const VANILLA_CREAM = "#FDFBF7";
const SOFT_TOFFEE = "#E6C2A5";

export default function GroupsScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const userId = useStore((s) => s.user?.id ?? null);
  const [groups, setGroups] = useState<{ id: string; name: string; createdAt: string; isOwner: boolean }[]>([]);
  const [totalOwedToYou, setTotalOwedToYou] = useState(0);
  const [totalYouOwe, setTotalYouOwe] = useState(0);
  const [loading, setLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authToken) {
      setLoading(false);
      setGroupsError(null);
      setGroups([]);
      return;
    }
    setLoading(true);
    setGroupsError(null);
    try {
      const [groupsData, balancesData] = await Promise.all([
        getGroups(authToken).catch((e) => {
          const msg = e instanceof Error ? e.message : "Failed to load groups";
          setGroupsError(msg);
          return [];
        }),
        userId ? getBalancesForUser(authToken, userId).catch(() => []) : Promise.resolve([]),
      ]);
      setGroups(Array.isArray(groupsData) ? groupsData : []);
      let owed = 0,
        owe = 0;
      (Array.isArray(balancesData) ? balancesData : []).forEach((b: { balanceAmount: number; youOwe: boolean }) => {
        const amt = Math.abs(b.balanceAmount);
        if (b.youOwe) owe += amt;
        else owed += amt;
      });
      setTotalOwedToYou(owed);
      setTotalYouOwe(owe);
    } catch {
      setGroups([]);
      setTotalOwedToYou(0);
      setTotalYouOwe(0);
    } finally {
      setLoading(false);
    }
  }, [authToken, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const [inviteLoading, setInviteLoading] = useState(false);
  async function inviteFriend() {
    if (!authToken || inviteLoading) return;
    if (groups.length === 0) {
      Alert.alert("No group", "Create a group first, then invite friends from here or from inside the group.");
      return;
    }
    setInviteLoading(true);
    try {
      const { inviteUrl } = await createGroupInviteLink(authToken, groups[0].id);
      await Share.share({
        message: `Join my SmartBudget AI group: ${inviteUrl}`,
        title: "Invite to group",
        url: inviteUrl,
      });
    } catch (e) {
      Alert.alert("Invite failed", e instanceof Error ? e.message : String(e));
    } finally {
      setInviteLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={WARM_CARAMEL} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Groups</Text>

      <View style={styles.darkCard}>
        <Text style={styles.darkCardTitle}>Balances</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>Who owes you</Text>
            <Text style={styles.balanceValueGreen}>${totalOwedToYou.toFixed(2)}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>Who you owe</Text>
            <Text style={styles.balanceValueRed}>${totalYouOwe.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.inviteBtn} onPress={inviteFriend} disabled={inviteLoading}>
        <UserPlus size={22} color="#FFF" />
        <Text style={styles.inviteBtnText}>{inviteLoading ? "Creating link…" : "Invite Friend"}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Your groups</Text>
      {groupsError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{groupsError}</Text>
          <Text style={styles.errorHint}>
            {groupsError.includes("Unauthorized") || groupsError.includes("401")
              ? "Sign in again from Profile."
              : groupsError.includes("User not found") || groupsError.includes("404")
                ? "Your account may not be synced. Sign in again from Profile."
                : "Pull down to retry."}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <Text style={styles.noData}>
          {authToken ? "No groups yet. Create one from the Scan tab." : "Sign in to see your groups."}
        </Text>
      ) : (
        groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={styles.groupCard}
            onPress={() => router.push(`/group/${g.id}`)}
            activeOpacity={0.8}
          >
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.memberCount}>{g.isOwner ? "Owner" : "Member"}</Text>
            </View>
            <Text style={styles.tapHint}>Tap to view expenses & balances</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: VANILLA_CREAM },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "700", color: DEEP_CHOCOLATE, marginBottom: 20 },
  darkCard: {
    backgroundColor: DEEP_CHOCOLATE,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  darkCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: SOFT_TOFFEE,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceRow: { flexDirection: "row", alignItems: "center" },
  balanceBlock: { flex: 1, alignItems: "center" },
  balanceLabel: { fontSize: 13, color: SOFT_TOFFEE, marginBottom: 6 },
  balanceValueGreen: { fontSize: 28, fontWeight: "800", color: "#34D399" },
  balanceValueRed: { fontSize: 28, fontWeight: "800", color: "#F87171" },
  balanceDivider: { width: 1, height: 40, backgroundColor: SOFT_TOFFEE, opacity: 0.5 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: WARM_CARAMEL,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  inviteBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  sectionTitle: { fontSize: 17, fontWeight: "600", color: DEEP_CHOCOLATE, marginBottom: 12 },
  errorBlock: { backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { fontSize: 14, color: "#B91C1C", fontWeight: "600", marginBottom: 6 },
  errorHint: { fontSize: 13, color: "#6B7280", marginBottom: 12 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: WARM_CARAMEL, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  retryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  noData: { fontSize: 14, color: "#6B7280", paddingVertical: 12 },
  groupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  groupName: { fontSize: 17, fontWeight: "600", color: DEEP_CHOCOLATE },
  memberCount: { fontSize: 13, color: "#6B7280" },
  tapHint: { fontSize: 13, color: "#6B7280", marginTop: 4 },
});
