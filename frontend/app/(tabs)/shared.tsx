import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Animated,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Users, Plus, X, Trash2, Link, Contact, UserPlus, Home } from "lucide-react-native";
import { getGroups, createGroup, deleteGroup, createGroupInviteLink, type GroupRow } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, SPACING, RADIUS, LIQUID } from "../../src/theme";

const GROUP_TYPES = ["Office", "Trip", "Party", "Other"] as const;
const SIRI_GLOW_COLORS = ["#00D4FF", "#FF00AA", "#FFD60A", "#BF5AF2"] as const;

export default function SharedTabScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupType, setGroupType] = useState<typeof GROUP_TYPES[number]>("Trip");
  const [creating, setCreating] = useState(false);
  const [inviteOptionsGroupId, setInviteOptionsGroupId] = useState<string | null>(null);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  const safeToken = authToken || "dev-token";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getGroups(safeToken);
      setGroups(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load groups";
      setError(msg);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [safeToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!createModalVisible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, useNativeDriver: true, duration: 2000 }),
        Animated.timing(glowAnim, { toValue: 0, useNativeDriver: true, duration: 2000 }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [createModalVisible, glowAnim]);

  const handleCreateGroup = useCallback(() => {
    const name = newGroupName.trim();
    if (!name) {
      Alert.alert("Missing", "Enter a group name.");
      return;
    }
    setCreating(true);
    createGroup(safeToken, name, groupType)
      .then(() => {
        setNewGroupName("");
        setCreateModalVisible(false);
        load();
      })
      .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Create failed"))
      .finally(() => setCreating(false));
  }, [safeToken, newGroupName, groupType, load]);

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      Alert.alert("Delete group", "Remove this group from your list? You can only delete groups you own.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGroup(safeToken, groupId);
              setGroups((prev) => prev.filter((g) => g.id !== groupId));
            } catch (e) {
              Alert.alert("Delete Failed", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    },
    [safeToken]
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={IOS_BLUE} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Shared</Text>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: IOS_BLUE }]}
          onPress={() => setCreateModalVisible(true)}
          activeOpacity={0.8}
        >
          <Plus size={20} color="#FFF" />
          <Text style={styles.createBtnText}>Create New Group</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => router.push("/household")} activeOpacity={0.85}>
        <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.householdCardOuter]}>
          <View style={styles.householdCardInner}>
            <Home size={22} color={IOS_BLUE} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.householdTitle, { color: textPrimary }]}>Household</Text>
              <Text style={[styles.householdSub, { color: textSecondary }]} numberOfLines={2}>
                Up to 5 people under one roof. Each receipt can be saved as Personal or Household.
              </Text>
            </View>
          </View>
        </GlassSurface>
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: textSecondary }]}>No groups yet. Tap "Create New Group" to start.</Text>
          }
          renderItem={({ item: g }) => (
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.groupCardOuter]}>
              <View style={styles.groupCardInner}>
                <TouchableOpacity
                  style={styles.groupCardMain}
                  onPress={() => router.push(`/group/${g.id}`)}
                  activeOpacity={0.8}
                >
                  <Users size={22} color={IOS_BLUE} />
                  <View style={styles.groupCardBody}>
                    <Text style={[styles.groupName, { color: textPrimary }]} numberOfLines={1}>{g.name}</Text>
                    <Text style={[styles.groupMeta, { color: textSecondary }]}>{g.isOwner ? "Owner" : "Member"}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.groupCardIconBtn}
                  onPress={() => {
                    Alert.alert("Delete group", "Remove this group from your list? You can only delete groups you own.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => handleDeleteGroup(g.id) },
                    ]);
                  }}
                  hitSlop={8}
                >
                  <Trash2 size={20} color={textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.groupCardIconBtn}
                  onPress={() => setInviteOptionsGroupId(g.id)}
                  hitSlop={8}
                >
                  <Plus size={22} color={IOS_BLUE} />
                </TouchableOpacity>
              </View>
            </GlassSurface>
          )}
        />
      )}

      {/* Invite options sheet: Share link, Copy link, Add from Contacts, Add Manually */}
      <Modal visible={!!inviteOptionsGroupId} transparent animationType="slide">
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setInviteOptionsGroupId(null)}
        />
        <View style={[styles.inviteOptionsSheet, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]} onStartShouldSetResponder={() => true}>
          <View style={styles.inviteOptionsHandle} />
          <Text style={[styles.inviteOptionsTitle, { color: textPrimary }]}>Invite to group</Text>
          {inviteOptionsGroupId && (
            <>
              <TouchableOpacity
                style={[styles.inviteOptionRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                disabled={inviteLinkLoading}
                onPress={async () => {
                  setInviteLinkLoading(true);
                  try {
                    const { token, inviteUrl } = await createGroupInviteLink(safeToken, inviteOptionsGroupId);
                    const deepLink = `smartbudget://join/${token}`;
                    await Share.share({
                      message: `Join my SmartBudget group: ${deepLink}`,
                      url: deepLink,
                      title: "Invite to group",
                    });
                    setInviteOptionsGroupId(null);
                  } catch (e) {
                    Alert.alert("Invite", e instanceof Error ? e.message : "Could not create link.");
                  } finally {
                    setInviteLinkLoading(false);
                  }
                }}
              >
                <Link size={22} color={IOS_BLUE} />
                <Text style={[styles.inviteOptionText, { color: textPrimary }]}>Share link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteOptionRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                disabled={inviteLinkLoading}
                onPress={async () => {
                  setInviteLinkLoading(true);
                  try {
                    const { token, inviteUrl } = await createGroupInviteLink(safeToken, inviteOptionsGroupId);
                    const deepLink = `smartbudget://join/${token}`;
                    const copyText = `App: ${deepLink}\nWeb: ${inviteUrl}`;
                    await Clipboard.setStringAsync(copyText);
                    Alert.alert("Link copied", "App and web links are in your clipboard.");
                    setInviteOptionsGroupId(null);
                  } catch (e) {
                    Alert.alert("Invite", e instanceof Error ? e.message : "Could not create link.");
                  } finally {
                    setInviteLinkLoading(false);
                  }
                }}
              >
                <Link size={22} color={IOS_BLUE} />
                <Text style={[styles.inviteOptionText, { color: textPrimary }]}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteOptionRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                onPress={() => {
                  const groupId = inviteOptionsGroupId;
                  setInviteOptionsGroupId(null);
                  if (groupId) router.push(`/group/${groupId}?openAdd=contacts`);
                }}
              >
                <Contact size={22} color={IOS_BLUE} />
                <Text style={[styles.inviteOptionText, { color: textPrimary }]}>Add from Contacts</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteOptionRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                onPress={() => {
                  const groupId = inviteOptionsGroupId;
                  setInviteOptionsGroupId(null);
                  if (groupId) router.push(`/group/${groupId}?openAdd=manual`);
                }}
              >
                <UserPlus size={22} color={IOS_BLUE} />
                <Text style={[styles.inviteOptionText, { color: textPrimary }]}>Add manually</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.inviteOptionsCancel, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7" }]}
            onPress={() => setInviteOptionsGroupId(null)}
          >
            <Text style={[styles.inviteOptionsCancelText, { color: textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.siriGlowWrapper}>
            <Animated.View style={[styles.siriGlowOuter, { opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] }) }]}>
              <LinearGradient
                colors={[...SIRI_GLOW_COLORS, SIRI_GLOW_COLORS[0]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <GlassSurface isDark={isDarkMode} borderRadius={24} style={[LIQUID.shadow, styles.modalCard]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textPrimary }]}>New group</Text>
                <TouchableOpacity onPress={() => !creating && setCreateModalVisible(false)} hitSlop={12}>
                  <X size={24} color={textPrimary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.modalLabel, { color: textSecondary }]}>Group name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="e.g. Trip to NYC"
                placeholderTextColor={textSecondary}
                editable={!creating}
              />
              <Text style={[styles.modalLabel, { color: textSecondary }]}>Group type</Text>
              <View style={styles.typePillRow}>
                {GROUP_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typePill, t === groupType && styles.typePillActive]}
                    onPress={() => setGroupType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typePillText, { color: t === groupType ? "#FFF" : textSecondary }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: IOS_BLUE }]}
                onPress={handleCreateGroup}
                disabled={creating}
                activeOpacity={0.8}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Create Group</Text>
                )}
              </TouchableOpacity>
            </GlassSurface>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1 },
  headerRow: { paddingHorizontal: SPACING.pageHorizontal, paddingTop: SPACING.pageTop + 24, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
  },
  createBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  householdCardOuter: {
    marginHorizontal: SPACING.pageHorizontal,
    marginBottom: 12,
  },
  householdCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: SPACING.cardPadding,
  },
  householdTitle: { fontSize: 17, fontWeight: "800" },
  householdSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  listContent: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 120 },
  groupCardOuter: {
    marginBottom: 12,
  },
  groupCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.cardPadding,
  },
  groupCardMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  groupCardIconBtn: { padding: 8, marginLeft: 4 },
  groupCardBody: { flex: 1, marginLeft: 14 },
  inviteOptionsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  inviteOptionsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.5)", alignSelf: "center", marginBottom: 20 },
  inviteOptionsTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  inviteOptionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  inviteOptionText: { fontSize: 17, fontWeight: "500" },
  inviteOptionsCancel: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  inviteOptionsCancelText: { fontSize: 17, fontWeight: "600" },
  groupName: { fontSize: 17, fontWeight: "700" },
  groupMeta: { fontSize: 13, marginTop: 2 },
  emptyText: { fontSize: 15, paddingHorizontal: 20, paddingVertical: 24 },
  errorBlock: { padding: 20 },
  errorText: { fontSize: 15, color: "#B91C1C", marginBottom: 12 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: IOS_BLUE, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  retryBtnText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  siriGlowWrapper: { width: "100%", maxWidth: 352, position: "relative", alignItems: "center", justifyContent: "center", padding: 6 },
  siriGlowOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    overflow: "hidden",
  },
  modalCard: { width: "100%", maxWidth: 340, padding: 24 },
  typePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 15,
    marginBottom: 20,
  },
  typePill: {
    width: "48%",
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 1,
  },
  typePillActive: { backgroundColor: IOS_BLUE, borderColor: IOS_BLUE },
  typePillText: { fontSize: 17, fontWeight: "700" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalLabel: { fontSize: 14, marginBottom: 6 },
  modalInput: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 20 },
  modalSubmit: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  modalSubmitText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});
