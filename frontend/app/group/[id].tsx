import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Share,
  FlatList,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { ArrowLeft, Plus, Minus, Users, Trash2, Search, Link, PenLine, Contact, Radio, MoreVertical, ChevronRight, Check, Circle, Receipt, ExternalLink, Pencil } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getGroupDashboard,
  deleteGroup,
  leaveGroup,
  addExpense,
  updateExpense,
  deleteExpense,
  addGroupMember,
  removeGroupMember,
  getGroupMemberDetails,
  settlePayment,
  createGroupInviteLink,
  type GroupDashboardResponse,
} from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, LIQUID, RADIUS } from "../../src/theme";

// TEMPORARILY DISABLED: socket.io was causing infinite buffer / crash
// import { io, Socket } from "socket.io-client";

export default function GroupPage() {
  const { id, openAdd } = useLocalSearchParams<{ id: string; openAdd?: string }>();
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const currentUserId = useStore((s) => s.user?.id ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const expensePrefill = useStore((s) => s.expensePrefill);
  const setExpensePrefill = useStore((s) => s.setExpensePrefill);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  // const socketRef = useRef<Socket | null>(null);

  const [dashboard, setDashboard] = useState<GroupDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNeedsReview, setExpenseNeedsReview] = useState(false);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [settlingRow, setSettlingRow] = useState<number | null>(null);
  const [settleAllLoading, setSettleAllLoading] = useState(false);
  const [addPersonManualVisible, setAddPersonManualVisible] = useState(false);
  const [addPersonContactsVisible, setAddPersonContactsVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [addPersonSubmitting, setAddPersonSubmitting] = useState(false);
  const [contactsList, setContactsList] = useState<{ id: string; name: string | null; phone?: string; email?: string }[]>([]);
  const [contactsSearchQuery, setContactsSearchQuery] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [trashSheetVisible, setTrashSheetVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<{
    id: string;
    description: string;
    amount: number;
    paidBy?: { id: string; name: string | null };
    createdAt?: string;
    splits?: { userId: string; amountOwed: number; user?: { id: string; name: string | null } }[];
    receiptId?: string | null;
    receiptUrl?: string | null;
    receipt?: {
      id: string;
      imageUrl: string | null;
      date: string;
      total: number;
      store?: { name: string } | null;
      items?: { name: string; totalPrice: number }[];
      user?: { id: string; name: string | null } | null;
    } | null;
  } | null>(null);
  type Tab = "expenses" | "balances" | "prices";
  const [tab, setTab] = useState<Tab>("expenses");
  const [priceSearchQuery, setPriceSearchQuery] = useState("");
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const [memberActionMember, setMemberActionMember] = useState<{
    id: string;
    userId?: string;
    name: string | null;
    email?: string;
    role?: string;
    isOwner: boolean;
  } | null>(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);
  const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null);
  const [memberDetailsVisible, setMemberDetailsVisible] = useState(false);
  const [memberDetailsMember, setMemberDetailsMember] = useState<{ name: string | null; email?: string; userId?: string } | null>(null);
  const [memberDetails, setMemberDetails] = useState<{
    groupsCount: number;
    owesInGroup: number;
    owedToInGroup: number;
  } | null>(null);
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false);
  const [expenseSplitMode, setExpenseSplitMode] = useState<"all" | "selected">("all");
  const [expenseSelectedIds, setExpenseSelectedIds] = useState<string[]>([]);
  const [expensePaidByUserId, setExpensePaidByUserId] = useState<string | null>(null);
  const [editExpenseVisible, setEditExpenseVisible] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [paidByPickerVisible, setPaidByPickerVisible] = useState(false);
  const [paidByPickerContext, setPaidByPickerContext] = useState<"add" | "edit">("add");
  const [expenseDeleteLoading, setExpenseDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    const safeToken = authToken || "dev-token";
    if (!id || !safeToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getGroupDashboard(safeToken, id as string);
      setDashboard(data);
      setErrorMsg(null);
    } catch (error: unknown) {
      let msg = "Unknown backend error";
      if (error && typeof error === "object") {
        const e = error as { response?: { data?: { message?: string }; status?: number }; message?: string; error?: string };
        msg = e.response?.data?.message || e.message || e.error || msg;
      }
      if (__DEV__) console.warn("Group Fetch Error:", msg);
      setDashboard(null);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [id, authToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll for updates while group screen is focused (replaces Socket.io to avoid crash)
  useFocusEffect(
    useCallback(() => {
      if (!id || !authToken) return;
      const interval = setInterval(() => load(), 15000);
      return () => clearInterval(interval);
    }, [id, authToken, load])
  );

  // When navigated from Shared tab with ?openAdd=contacts or ?openAdd=manual, open the corresponding add-member flow
  useEffect(() => {
    if (!id || !openAdd) return;
    if (openAdd === "contacts") {
      setAddPersonContactsVisible(true);
    } else if (openAdd === "manual") {
      setAddPersonManualVisible(true);
    }
  }, [id, openAdd]);

  useEffect(() => {
    if (addExpenseVisible && expensePrefill) {
      setExpenseDesc(expensePrefill.description);
      setExpenseAmount(String(expensePrefill.amount));
      setExpenseNeedsReview(expensePrefill.needsReview === true);
      setExpensePrefill(null);
    }
  }, [addExpenseVisible, expensePrefill, setExpensePrefill]);

  const membersFromDashboard = Array.isArray(dashboard?.members) ? dashboard.members : [];
  const participantIdsForAdd = membersFromDashboard.map((m) => (m as { userId?: string }).userId ?? (m as { id?: string }).id).filter((x): x is string => Boolean(x));
  const prevAddExpenseVisible = useRef(false);
  useEffect(() => {
    const justOpened = addExpenseVisible && !prevAddExpenseVisible.current;
    prevAddExpenseVisible.current = addExpenseVisible;
    if (justOpened && participantIdsForAdd.length > 0) {
      setExpenseSplitMode("all");
      setExpenseSelectedIds([...participantIdsForAdd]);
      setExpensePaidByUserId(currentUserId ?? null);
    }
  }, [addExpenseVisible, participantIdsForAdd, currentUserId]);

  if (!id) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.errorText, { color: textPrimary }]}>Missing group ID</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "red" }}>Backend Error</Text>
        <Text style={{ color: "red", textAlign: "center", marginTop: 10, paddingHorizontal: 20 }}>{errorMsg}</Text>
        <TouchableOpacity onPress={() => { setErrorMsg(null); load(); }} style={{ marginTop: 16 }}>
          <Text style={{ color: IOS_BLUE, fontSize: 16 }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !dashboard) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={IOS_BLUE} />
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <Text style={[styles.errorText, { color: textPrimary }]}>Group not found</Text>
        <TouchableOpacity onPress={() => { setErrorMsg(null); load(); }} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Safe fallbacks so empty/new groups never crash the list rendering
  const members = Array.isArray(dashboard?.members) ? dashboard.members : [];
  const recentExpenses = Array.isArray(dashboard?.recent_expenses) ? dashboard.recent_expenses : [];
  const balancesList = Array.isArray(dashboard?.balances) ? dashboard.balances : [];
  const effectiveCurrentUserId = dashboard?.currentUserId ?? currentUserId;
  const currentUserIsOwner = !!effectiveCurrentUserId && dashboard?.group?.ownerId === effectiveCurrentUserId;
  const memberNames: Record<string, string> = {};
  members.forEach((m) => {
    const uid = m.userId ?? m.id;
    if (uid) memberNames[uid] = m.name?.trim() || m.email || "Member";
  });
  const isAdmin = !!dashboard?.isAdmin;
  const participantIds: string[] = members.map((m) => m.userId ?? m.id).filter((x): x is string => Boolean(x));
  const paidByDisplayName = (() => {
    const m = members.find((x) => ((x as { userId?: string }).userId ?? (x as { id?: string }).id) === expensePaidByUserId);
    return m ? (m.name?.trim() || (m as { email?: string }).email || "Member") : "Tap to select";
  })();

  const totalGroupSpending = Number(dashboard?.total_group_expenses ?? 0);
  const youOwe = (balancesList || []).filter((b) => b.fromUserId === effectiveCurrentUserId).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const youAreOwed = (balancesList || []).filter((b) => b.toUserId === effectiveCurrentUserId).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const balanceLabel = youOwe > 0 && youAreOwed === 0 ? `You owe $${youOwe.toFixed(2)}` : youAreOwed > 0 && youOwe === 0 ? `You are owed $${youAreOwed.toFixed(2)}` : youOwe > 0 || youAreOwed > 0 ? `Owe $${youOwe.toFixed(2)} · Owed $${youAreOwed.toFixed(2)}` : "Settled up";
  const unsettledTotal = (balancesList || []).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const balancesCount = balancesList?.length ?? 0;
  const expenseCount = recentExpenses?.length ?? 0;
  const isFullySettled = balancesCount === 0;

  const priceRecords = Array.isArray(dashboard?.price_records) ? dashboard.price_records : [];
  const priceSearchLower = priceSearchQuery.trim().toLowerCase();
  const filteredPriceRecords = priceSearchLower
    ? priceRecords.filter(
        (r) =>
          (r.canonicalItemName ?? r.rawItemName ?? "").toLowerCase().includes(priceSearchLower) ||
          (r.canonicalStoreName ?? r.rawStoreName ?? r.storeName ?? "").toLowerCase().includes(priceSearchLower) ||
          (r.rawItemName ?? "").toLowerCase().includes(priceSearchLower) ||
          (r.rawStoreName ?? "").toLowerCase().includes(priceSearchLower)
      )
    : priceRecords;

  async function handleAddExpense() {
    const safeToken = authToken || "dev-token";
    const safeUserId = currentUserId || "test-user-123";
    const desc = expenseDesc.trim();
    const amt = parseFloat(expenseAmount);
    if (!expenseDesc?.trim() || !expenseAmount?.trim()) {
      Alert.alert("Error", "Please enter description and amount");
      return;
    }
    if (!id) {
      Alert.alert("Failed", "Group not found.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid", "Enter a positive amount.");
      return;
    }
    const idsToUse = expenseSplitMode === "all" ? participantIds : expenseSelectedIds;
    if (!idsToUse.length) {
      Alert.alert("Failed", "Select at least one participant.");
      return;
    }
    const paidBy = expensePaidByUserId && participantIds.includes(expensePaidByUserId) ? expensePaidByUserId : safeUserId;
    setExpenseSubmitting(true);
    try {
      await addExpense(safeToken, {
        groupId: id,
        description: desc,
        amount: amt,
        paidByUserId: paidBy,
        splitType: "equal",
        splitInput: { type: "equal", participantIds: idsToUse },
      });
      setExpenseDesc("");
      setExpenseAmount("");
      setAddExpenseVisible(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert("Could not add expense", msg && !msg.includes("Invalid") && !msg.includes("Prisma") ? msg : "Please try again.");
    } finally {
      setExpenseSubmitting(false);
    }
  }

  async function handleEditExpense() {
    const safeToken = authToken || "dev-token";
    const desc = expenseDesc.trim();
    const amt = parseFloat(expenseAmount);
    if (!editingExpenseId || !id) return;
    if (!desc) {
      Alert.alert("Error", "Please enter a description.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid", "Enter a positive amount.");
      return;
    }
    const idsToUse = expenseSplitMode === "all" ? participantIds : expenseSelectedIds;
    if (!idsToUse.length) {
      Alert.alert("Failed", "Select at least one participant.");
      return;
    }
    const paidBy = expensePaidByUserId && participantIds.includes(expensePaidByUserId) ? expensePaidByUserId : currentUserId;
    if (!paidBy) {
      Alert.alert("Failed", "Please select who paid.");
      return;
    }
    setExpenseSubmitting(true);
    try {
      await updateExpense(safeToken, editingExpenseId, {
        description: desc,
        amount: amt,
        paidByUserId: paidBy,
        splitInput: { type: "equal", participantIds: idsToUse },
      });
      setEditExpenseVisible(false);
      setEditingExpenseId(null);
      await load();
      setInviteFeedback("Expense updated.");
      setTimeout(() => setInviteFeedback(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert("Could not update expense", msg && !msg.includes("Invalid") && !msg.includes("Prisma") ? msg : "Please try again.");
    } finally {
      setExpenseSubmitting(false);
    }
  }

  function handleDeleteGroup() {
    Alert.alert(
      "Delete group",
      "This will permanently delete the group and all its data. You cannot undo this.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            setDeleteSubmitting(true);
            try {
              const safeToken = authToken || "dev-token";
              await deleteGroup(safeToken, id);
              setTrashSheetVisible(false);
              router.replace("/(tabs)/shared");
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert("Could not delete group", /Prisma|Invalid|raw/i.test(msg) ? "Please try again." : msg);
            } finally {
              setDeleteSubmitting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      {tab === "prices" ? (
        <View style={styles.pricesOuter}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
              <ArrowLeft size={24} color={textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitleCentered, { color: textPrimary }]} numberOfLines={1}>
              {dashboard?.group?.name || "Group"}
            </Text>
            <TouchableOpacity onPress={() => setTrashSheetVisible(true)} style={styles.gearBtn} hitSlop={12}>
              <Trash2 size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabBtn, (tab as Tab) === "expenses" && styles.tabBtnActive]} onPress={() => setTab("expenses")}>
              <Text style={[styles.tabBtnText, { color: (tab as Tab) === "expenses" ? "#FFF" : textSecondary }]}>Expenses</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, (tab as Tab) === "balances" && styles.tabBtnActive]} onPress={() => setTab("balances")}>
              <Text style={[styles.tabBtnText, { color: (tab as Tab) === "balances" ? "#FFF" : textSecondary }]}>Balances</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, (tab as Tab) === "prices" && styles.tabBtnActive]} onPress={() => setTab("prices")}>
              <Text style={[styles.tabBtnText, { color: (tab as Tab) === "prices" ? "#FFF" : textSecondary }]}>Prices</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.priceSearchWrapper, { backgroundColor: "#E3E3E9" }]}>
            <Search size={20} color="#8E8E93" style={styles.priceSearchIcon} />
            <TextInput
              style={styles.priceSearchInput}
              placeholder="Search by item or store"
              placeholderTextColor="#8E8E93"
              value={priceSearchQuery}
              onChangeText={setPriceSearchQuery}
            />
          </View>
          <FlatList
            data={filteredPriceRecords}
            keyExtractor={(item) => item.id}
            style={styles.priceList}
            contentContainerStyle={styles.priceListContent}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textSecondary }]}>
                {priceRecords.length === 0 ? "No shared prices yet. Receipts synced to this group will appear here." : "No matches."}
              </Text>
            }
            renderItem={({ item }) => (
              <GlassSurface isDark={isDarkMode} borderRadius={12} style={[LIQUID.shadow, styles.priceRow]}>
                <View style={styles.priceRowLeft}>
                  <View style={[styles.priceRowIcon, { backgroundColor: bg }]}>
                    <Text style={[styles.priceRowIconText, { color: textPrimary }]}>
                      {(item.canonicalItemName ?? item.rawItemName ?? "?").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.priceRowMiddle}>
                    <Text style={[styles.priceRowName, { color: textPrimary }]} numberOfLines={1}>
                      {item.canonicalItemName ?? item.rawItemName ?? "—"}
                    </Text>
                    <Text style={[styles.priceRowStore, { color: textSecondary }]} numberOfLines={1}>
                      {item.canonicalStoreName ?? item.rawStoreName ?? item.storeName ?? "—"}
                    </Text>
                    <Text style={[styles.priceRowDate, { color: textSecondary }]}>
                      Uploaded on {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : "—"}
                      {item.createdByUser?.name ? ` by ${item.createdByUser.name}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.priceRowRight}>
                  <Text style={[styles.priceRowPrice, { color: textPrimary }]}>${Number(item.price).toFixed(2)}</Text>
                  {item.normalizedUnitPrice != null && item.unit && (
                    <Text style={[styles.priceRowUnit, { color: textSecondary }]}>
                      ${Number(item.normalizedUnitPrice).toFixed(2)} / {item.unit}
                    </Text>
                  )}
                </View>
              </GlassSurface>
            )}
          />
        </View>
      ) : (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <ArrowLeft size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitleCentered, { color: textPrimary }]} numberOfLines={1}>
            {dashboard?.group?.name || "Group"}
          </Text>
          <TouchableOpacity onPress={() => setTrashSheetVisible(true)} style={styles.gearBtn} hitSlop={12}>
            <Trash2 size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>
        <View style={styles.tabRow}>
          {(() => {
            const t: Tab = tab;
            return (
              <>
                <TouchableOpacity
                  style={[styles.tabBtn, t === "expenses" && styles.tabBtnActive]}
                  onPress={() => setTab("expenses")}
                >
                  <Text style={[styles.tabBtnText, { color: t === "expenses" ? "#FFF" : textSecondary }]}>Expenses</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, t === "balances" && styles.tabBtnActive]}
                  onPress={() => setTab("balances")}
                >
                  <Text style={[styles.tabBtnText, { color: t === "balances" ? "#FFF" : textSecondary }]}>Balances</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, (t as Tab) === "prices" && styles.tabBtnActive]}
                  onPress={() => setTab("prices")}
                >
                  <Text style={[styles.tabBtnText, { color: (t as Tab) === "prices" ? "#FFF" : textSecondary }]}>Prices</Text>
                </TouchableOpacity>
              </>
            );
          })()}
        </View>
        <>
        {tab === "expenses" && (
          <>
            {/* 1. Group summary card */}
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.summaryCard]}>
              <Text style={[styles.summaryCardTitle, { color: textPrimary }]}>Group summary</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: textPrimary }]}>${totalGroupSpending.toFixed(2)}</Text>
                  <Text style={[styles.summaryLabel, { color: textSecondary }]}>Total spent</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: textPrimary }]}>${unsettledTotal.toFixed(2)}</Text>
                  <Text style={[styles.summaryLabel, { color: textSecondary }]}>Unsettled</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: textPrimary }]}>{expenseCount}</Text>
                  <Text style={[styles.summaryLabel, { color: textSecondary }]}>{expenseCount === 1 ? "Expense" : "Expenses"}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: textPrimary }]}>{members.length}</Text>
                  <Text style={[styles.summaryLabel, { color: textSecondary }]}>{members.length === 1 ? "Member" : "Members"}</Text>
                </View>
              </View>
              <View style={[styles.summarySettlement, { backgroundColor: bg }]}>
                {isFullySettled ? (
                  <Text style={[styles.summarySettlementText, { color: "#34C759" }]}>Settled up</Text>
                ) : (
                  <>
                    <Text style={[styles.summarySettlementText, { color: textPrimary }]}>
                      {balancesCount} {balancesCount === 1 ? "balance" : "balances"} outstanding
                    </Text>
                    <TouchableOpacity
                      style={[styles.settleAllBtn, { backgroundColor: youOwe > 0 && effectiveCurrentUserId ? IOS_BLUE : (isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)"), marginTop: 12 }]}
                      onPress={() => {
                        const groupId = typeof id === "string" ? id : (Array.isArray(id) ? id?.[0] : undefined);
                        const safeToken = authToken || "dev-token";
                        if (!groupId?.trim()) return;
                        if (!effectiveCurrentUserId) {
                          Alert.alert("Sign in to settle", "Sign in to mark balances as settled.");
                          return;
                        }
                        const myDebts = (balancesList || []).filter((b) => b.fromUserId === effectiveCurrentUserId);
                        if (myDebts.length === 0 || youOwe <= 0) {
                          Alert.alert("Nothing for you to settle", "You don't owe anything. Others need to settle what they owe you.");
                          return;
                        }
                        Alert.alert(
                          "Settle all?",
                          `Mark all ${myDebts.length} balance${myDebts.length === 1 ? "" : "s"} you owe ($${youOwe.toFixed(2)} total) as settled?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Settle all",
                              onPress: async () => {
                                setSettleAllLoading(true);
                                try {
                                  for (const b of myDebts) {
                                    await settlePayment(safeToken, groupId, effectiveCurrentUserId, b.toUserId, Number(b.amount ?? 0));
                                  }
                                  await load();
                                  setInviteFeedback("All settled.");
                                  setTimeout(() => setInviteFeedback(null), 3000);
                                } catch (e) {
                                  const msg = e instanceof Error ? e.message : "Could not settle.";
                                  Alert.alert("Could not settle all", /Prisma|Invalid|raw/i.test(msg) ? "Please try again." : msg);
                                } finally {
                                  setSettleAllLoading(false);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={settleAllLoading}
                    >
                      {settleAllLoading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={[styles.settleAllBtnText, { color: youOwe > 0 && effectiveCurrentUserId ? "#FFF" : textSecondary }]}>Settle all</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </GlassSurface>

            {inviteFeedback ? (
              <View style={[styles.inviteFeedbackBar, { backgroundColor: isDarkMode ? "rgba(52,199,89,0.2)" : "rgba(52,199,89,0.15)" }]}>
                <Text style={[styles.inviteFeedbackText, { color: isDarkMode ? "#30D158" : "#34C759" }]} numberOfLines={2}>{inviteFeedback}</Text>
              </View>
            ) : null}

            {/* 2. Members card – +/- add/remove */}
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.membersCard]}>
              <View style={styles.membersCardHeader}>
                <Text style={[styles.membersCardTitle, { color: textPrimary }]}>Members</Text>
                <View style={styles.membersCardActions}>
                  <TouchableOpacity onPress={() => setInviteSheetVisible(true)} style={[styles.memberPlusMinusBtn, { backgroundColor: isDarkMode ? "rgba(52,199,89,0.25)" : "rgba(52,199,89,0.2)" }]} hitSlop={8}>
                    <Plus size={20} color="#34C759" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
              {members.length === 0 ? (
                <Text style={[styles.empty, { color: textSecondary }]}>No members yet. Tap + to invite.</Text>
              ) : (
                members.map((m) => {
                  const uid = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
                  const displayName = m.name?.trim() || (m as { email?: string }).email || "Member";
                  const initials = displayName.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                  const isOwner = uid === dashboard?.group?.ownerId;
                  const statusLabel = isOwner ? "Owner" : "Joined";
                  const canRemove = !isOwner && (uid ?? (m as { id?: string }).id);
                  return (
                    <View key={uid ?? displayName} style={[styles.memberRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]} collapsable={false}>
                      <TouchableOpacity
                        style={styles.memberRowTouchable}
                        onPress={() => setMemberActionMember({
                          id: m.id ?? uid!,
                          userId: uid,
                          name: m.name ?? null,
                          email: (m as { email?: string }).email,
                          role: (m as { role?: string }).role,
                          isOwner,
                        })}
                        onLongPress={() => setMemberActionMember({
                          id: m.id ?? uid!,
                          userId: uid,
                          name: m.name ?? null,
                          email: (m as { email?: string }).email,
                          role: (m as { role?: string }).role,
                          isOwner,
                        })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.memberRowAvatar, { backgroundColor: bg }]}>
                          <Text style={[styles.memberRowInitials, { color: textPrimary }]}>{initials}</Text>
                        </View>
                        <View style={styles.memberRowCenter}>
                          <Text style={[styles.memberRowName, { color: textPrimary }]} numberOfLines={1}>{displayName}</Text>
                          <View style={[styles.memberRowBadge, { backgroundColor: isOwner ? (isDarkMode ? "rgba(255,149,0,0.25)" : "rgba(255,149,0,0.2)") : (isDarkMode ? "rgba(52,199,89,0.2)" : "rgba(52,199,89,0.15)") }]}>
                            <Text style={[styles.memberRowBadgeText, { color: isOwner ? "#FF9500" : "#34C759" }]}>{statusLabel}</Text>
                          </View>
                        </View>
                        {!canRemove && <MoreVertical size={20} color={textSecondary} />}
                      </TouchableOpacity>
                      {canRemove ? (
                        <TouchableOpacity
                          onPress={() => {
                            const targetUserId = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
                            if (!targetUserId) return;
                            const groupId = typeof id === "string" ? id : (Array.isArray(id) ? id?.[0] : undefined);
                            if (!groupId?.trim()) {
                              Alert.alert("Cannot remove", "Reopen the group and try again.");
                              return;
                            }
                            const safeToken = authToken || "dev-token";
                            Alert.alert(
                              "Remove member?",
                              `Remove ${displayName} from this group? They will need to be re-invited to rejoin.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove",
                                  style: "destructive",
                                  onPress: async () => {
                                    setRemoveMemberLoading(true);
                                    setRemovingMemberUserId(targetUserId);
                                    try {
                                      await removeGroupMember(safeToken, groupId, targetUserId);
                                      await load().catch(() => {});
                                      setInviteFeedback("Member removed.");
                                      setTimeout(() => setInviteFeedback(null), 3000);
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "Could not remove member.";
                                      if (msg.toLowerCase().includes("unsettled") || msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("settle")) {
                                        Alert.alert("Can't remove member", "This member has unsettled balances and can't be removed yet.");
                                      } else if (msg.toLowerCase().includes("only group owner") || msg.toLowerCase().includes("owner")) {
                                        Alert.alert("Can't remove member", "Only the group owner can remove members.");
                                      } else {
                                        Alert.alert("Could not remove member", /Prisma|Invalid|raw/i.test(msg) ? "Please try again." : msg);
                                      }
                                    } finally {
                                      setRemoveMemberLoading(false);
                                      setRemovingMemberUserId(null);
                                    }
                                  },
                                },
                              ]
                            );
                          }}
                          style={[styles.memberMinusBtn, { backgroundColor: isDarkMode ? "rgba(255,59,48,0.2)" : "rgba(255,59,48,0.15)", zIndex: 10 }]}
                          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                          disabled={removeMemberLoading}
                          activeOpacity={0.6}
                        >
                          {removingMemberUserId === ((m as { userId?: string }).userId ?? (m as { id?: string }).id) ? (
                            <ActivityIndicator size="small" color="#FF3B30" />
                          ) : (
                            <Minus size={18} color="#FF3B30" strokeWidth={2.5} />
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}
            </GlassSurface>

            {/* 3. Expenses list */}
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Expenses</Text>
            {recentExpenses.length === 0 ? (
              <Text style={[styles.empty, { color: textSecondary }]}>No expenses yet. Add one with the button below.</Text>
            ) : (
              recentExpenses.map((e) => {
                const fromReceipt = !!(e.receiptId ?? e.receipt);
                const receiptSubtitle = fromReceipt ? (e.receipt?.store?.name ? `From scanned receipt · ${e.receipt.store.name}` : "From scanned receipt") : null;
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => setSelectedExpense({
                      id: e.id,
                      description: e.description ?? "",
                      amount: Number(e.amount ?? 0),
                      paidBy: e.paidBy,
                      createdAt: e.createdAt,
                      splits: e.splits,
                      receiptId: e.receiptId ?? null,
                      receiptUrl: e.receiptUrl ?? null,
                      receipt: e.receipt ?? null,
                    })}
                    activeOpacity={0.85}
                  >
                    <GlassSurface isDark={isDarkMode} borderRadius={16} style={[LIQUID.shadow, styles.expenseRowCompact]}>
                      <View style={styles.expenseRowCompactInner}>
                        <View style={styles.expenseLeft}>
                          <View style={styles.expenseRowTitleRow}>
                            {fromReceipt && <Receipt size={16} color={textSecondary} style={styles.expenseReceiptIcon} />}
                            <Text style={[styles.expenseDesc, { color: textPrimary }]} numberOfLines={1}>{e.description}</Text>
                          </View>
                          <Text style={[styles.expenseMeta, { color: textSecondary }]}>
                            {receiptSubtitle ?? `${e.paidBy?.name || "Someone"} · ${e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ""} · Split equally`}
                          </Text>
                        </View>
                        <Text style={[styles.expenseAmountRight, { color: textPrimary }]}>${Number(e.amount ?? 0).toFixed(2)}</Text>
                        <ChevronRight size={18} color={textSecondary} />
                      </View>
                    </GlassSurface>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {tab === "balances" && (
          <>
            {/* Settlement summary */}
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.summaryCard]}>
              <Text style={[styles.summaryCardTitle, { color: textPrimary }]}>Settlement</Text>
              {isFullySettled ? (
                <Text style={[styles.settlementDone, { color: "#34C759" }]}>Everyone is settled up.</Text>
              ) : (
                <>
                  <Text style={[styles.summaryValue, { color: textPrimary }]}>${unsettledTotal.toFixed(2)} total unsettled</Text>
                  <Text style={[styles.summaryLabel, { color: textSecondary, marginTop: 4 }]}>{balancesCount} {balancesCount === 1 ? "balance" : "balances"} to settle</Text>
                  <TouchableOpacity
                    style={[styles.settleAllBtn, { backgroundColor: youOwe > 0 && effectiveCurrentUserId ? IOS_BLUE : (isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)"), marginTop: 14 }]}
                    onPress={() => {
                      const groupId = typeof id === "string" ? id : (Array.isArray(id) ? id?.[0] : undefined);
                      const safeToken = authToken || "dev-token";
                      if (!groupId?.trim()) return;
                      if (!effectiveCurrentUserId) {
                        Alert.alert("Sign in to settle", "Sign in to mark balances as settled.");
                        return;
                      }
                      const myDebts = (balancesList || []).filter((b) => b.fromUserId === effectiveCurrentUserId);
                      if (myDebts.length === 0 || youOwe <= 0) {
                        Alert.alert("Nothing for you to settle", "You don't owe anything. Others need to settle what they owe you.");
                        return;
                      }
                      Alert.alert(
                        "Settle all?",
                        `Mark all ${myDebts.length} balance${myDebts.length === 1 ? "" : "s"} you owe ($${youOwe.toFixed(2)} total) as settled?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Settle all",
                            onPress: async () => {
                              setSettleAllLoading(true);
                              try {
                                for (const b of myDebts) {
                                  await settlePayment(safeToken, groupId, effectiveCurrentUserId, b.toUserId, Number(b.amount ?? 0));
                                }
                                await load();
                                setInviteFeedback("All settled.");
                                setTimeout(() => setInviteFeedback(null), 3000);
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "Could not settle.";
                                Alert.alert("Could not settle all", /Prisma|Invalid|raw/i.test(msg) ? "Please try again." : msg);
                              } finally {
                                setSettleAllLoading(false);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    disabled={settleAllLoading}
                  >
                    {settleAllLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={[styles.settleAllBtnText, { color: youOwe > 0 && effectiveCurrentUserId ? "#FFF" : textSecondary }]}>Settle all</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </GlassSurface>

            {/* Who owes who – visual rows */}
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Who owes who</Text>
            {balancesList.length === 0 ? (
              <Text style={[styles.empty, { color: textSecondary }]}>No balances. Everyone is settled.</Text>
            ) : (
              balancesList.map((s, i) => {
                const isDebtor = effectiveCurrentUserId === s.fromUserId;
                const fromName = memberNames[s.fromUserId] ?? "Someone";
                const toName = memberNames[s.toUserId] ?? "Someone";
                const amount = Number(s.amount ?? 0);
                const fromInitials = fromName.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                const toInitials = toName.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <GlassSurface key={`balance-${i}`} isDark={isDarkMode} borderRadius={16} style={[LIQUID.shadow, styles.balanceRowVisual]}>
                    <View style={[styles.balanceAvatar, { backgroundColor: bg }]}>
                      <Text style={[styles.balanceAvatarText, { color: textPrimary }]}>{fromInitials}</Text>
                    </View>
                    <Text style={[styles.balanceDebtorName, { color: textPrimary }]} numberOfLines={1}>{fromName}</Text>
                    <Text style={[styles.balanceArrow, { color: textSecondary }]}>→</Text>
                    <View style={[styles.balanceAvatar, { backgroundColor: bg }]}>
                      <Text style={[styles.balanceAvatarText, { color: textPrimary }]}>{toInitials}</Text>
                    </View>
                    <Text style={[styles.balanceCreditorName, { color: textPrimary }]} numberOfLines={1}>{toName}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.balanceAmountRight, { color: textPrimary }]}>${amount.toFixed(2)}</Text>
                    {isDebtor && effectiveCurrentUserId && (
                      <TouchableOpacity
                        style={[styles.settleBtnCompact, { backgroundColor: IOS_BLUE }]}
                        onPress={async () => {
                          const groupId = typeof id === "string" ? id : (Array.isArray(id) ? id?.[0] : undefined);
                          const safeToken = authToken || "dev-token";
                          if (!groupId?.trim()) return;
                          setSettlingRow(i);
                          try {
                            await settlePayment(safeToken, groupId, effectiveCurrentUserId, s.toUserId, s.amount);
                            await load();
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "";
                            Alert.alert("Could not settle", msg && !/Prisma|Invalid|raw/i.test(msg) ? msg : "Could not settle this balance. Please try again.");
                          } finally {
                            setSettlingRow(null);
                          }
                        }}
                        disabled={settlingRow !== null}
                      >
                        {settlingRow === i ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.settleBtnText}>Settle</Text>}
                      </TouchableOpacity>
                    )}
                  </GlassSurface>
                );
              })
            )}
          </>
        )}

        <View style={styles.bottomSpacer} />
        </>
      </ScrollView>
      )}

      {tab === "expenses" && (
      <TouchableOpacity style={[styles.addBtnFab, { backgroundColor: IOS_BLUE }]} onPress={() => setAddExpenseVisible(true)} activeOpacity={0.9}>
        <Plus size={26} color="#FFF" strokeWidth={2.5} />
      </TouchableOpacity>
      )}

      {/* Member action sheet */}
      <Modal visible={memberActionMember !== null} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMemberActionMember(null)}
          />
          <View style={[styles.memberActionSheet, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]}>
            <View style={styles.memberActionHandle} />
            {memberActionMember && (
              <>
                <View style={styles.memberActionHeader}>
                  <View style={[styles.memberActionAvatar, { backgroundColor: bg }]}>
                    <Text style={[styles.memberActionInitials, { color: textPrimary }]}>
                      {(memberActionMember.name ?? memberActionMember.email ?? "?").toString().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <Text style={[styles.memberActionName, { color: textPrimary }]}>{memberActionMember.name || memberActionMember.email || "Member"}</Text>
                  <Text style={[styles.memberActionRole, { color: textSecondary }]}>{memberActionMember.isOwner ? "Owner" : "Joined"}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.memberActionRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                  onPress={async () => {
                    const uid = memberActionMember.userId ?? memberActionMember.id;
                    if (!id || !uid || !authToken) return;
                    const owesInGroup = (balancesList || []).filter((b) => b.fromUserId === uid).reduce((s, b) => s + Number(b.amount ?? 0), 0);
                    const owedToInGroup = (balancesList || []).filter((b) => b.toUserId === uid).reduce((s, b) => s + Number(b.amount ?? 0), 0);
                    setMemberDetailsMember({ name: memberActionMember.name ?? null, email: memberActionMember.email, userId: uid });
                    setMemberDetailsVisible(true);
                    setMemberDetailsLoading(true);
                    setMemberDetails(null);
                    setMemberActionMember(null);
                    try {
                      const { groupsCount } = await getGroupMemberDetails(authToken, id, uid);
                      setMemberDetails({ groupsCount, owesInGroup, owedToInGroup });
                    } catch {
                      setMemberDetails({ groupsCount: 0, owesInGroup, owedToInGroup });
                    } finally {
                      setMemberDetailsLoading(false);
                    }
                  }}
                >
                  <Text style={[styles.memberActionRowText, { color: textPrimary }]}>View details</Text>
                  <ChevronRight size={20} color={textSecondary} />
                </TouchableOpacity>
                {!memberActionMember.isOwner && (memberActionMember.userId ?? memberActionMember.id) && (() => {
                  const uid = String(memberActionMember.userId ?? memberActionMember.id);
                  const hasUnsettled = (balancesList || []).some(
                    (b) =>
                      (b.fromUserId === uid || b.toUserId === uid) && Number(b.amount ?? 0) >= 0.01
                  );
                  if (!currentUserIsOwner) {
                    return (
                      <Text style={[styles.memberActionHelper, { color: textSecondary }]}>
                        Only the group owner can remove members
                      </Text>
                    );
                  }
                  return (
                    <>
                      {hasUnsettled && (
                        <Text style={[styles.memberActionHelper, { color: textSecondary }]}>
                          This member has unsettled balances and can't be removed yet.
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.memberActionRow, styles.memberActionRowDestructive]}
                        disabled={hasUnsettled || removeMemberLoading}
                        onPress={() => {
                          const name = memberActionMember.name || memberActionMember.email || "This person";
                          Alert.alert(
                            `Remove ${name} from this group?`,
                            "They will no longer appear in this group.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: async () => {
                                  if (!id || !authToken) return;
                                  setRemoveMemberLoading(true);
                                  try {
                                    const apiUserId = memberActionMember.userId ?? uid;
                                    await removeGroupMember(authToken, id, apiUserId);
                                setMemberActionMember(null);
                                setMemberDetailsVisible(false);
                                setMemberDetails(null);
                                await load();
                                setInviteFeedback("Member removed.");
                                setTimeout(() => setInviteFeedback(null), 3000);
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "Could not remove member.";
                                if (msg.toLowerCase().includes("unsettled") || msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("settle")) {
                                  Alert.alert("Can't remove member", "This member has unsettled balances and can't be removed yet.");
                                } else if (msg.toLowerCase().includes("only group owner") || msg.toLowerCase().includes("owner")) {
                                  Alert.alert("Can't remove member", "Only the group owner can remove members.");
                                } else {
                                  Alert.alert("Could not remove member", /Prisma|Invalid|raw/i.test(msg) ? "Please try again." : msg);
                                }
                              } finally {
                                setRemoveMemberLoading(false);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    {removeMemberLoading ? <ActivityIndicator size="small" color="#FF3B30" /> : <Text style={styles.memberActionRowDestructiveText}>Remove from group</Text>}
                  </TouchableOpacity>
                    </>
                  );
                })()}
                <TouchableOpacity
                  style={[styles.memberActionCancel, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7" }]}
                  onPress={() => { setMemberActionMember(null); setMemberDetailsVisible(false); setMemberDetails(null); }}
                >
                  <Text style={[styles.memberActionCancelText, { color: textPrimary }]}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Member details modal */}
      <Modal visible={memberDetailsVisible} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          activeOpacity={1}
          onPress={() => { setMemberDetailsVisible(false); setMemberDetails(null); setMemberDetailsMember(null); }}
        >
          <View
            style={[styles.memberDetailsSheet, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.memberActionHandle} />
            {memberDetailsMember && (
              <>
                <Text style={[styles.memberDetailsTitle, { color: textPrimary }]}>
                  {memberDetailsMember.name || memberDetailsMember.email || "Member"}
                </Text>
                {memberDetailsLoading ? (
                  <ActivityIndicator size="large" color={IOS_BLUE} style={{ marginVertical: 24 }} />
                ) : memberDetails ? (
                  <ScrollView style={styles.memberDetailsScroll} contentContainerStyle={styles.memberDetailsScrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.memberDetailsGrid}>
                      <View style={[styles.memberDetailsCard, { backgroundColor: bg }]}>
                        <Text style={[styles.memberDetailsValue, { color: textPrimary }]}>{memberDetails.groupsCount}</Text>
                        <Text style={[styles.memberDetailsLabel, { color: textSecondary }]}>Groups</Text>
                      </View>
                      <View style={[styles.memberDetailsCard, { backgroundColor: bg }]}>
                        <Text style={[styles.memberDetailsValue, { color: "#FF3B30" }]}>${memberDetails.owesInGroup.toFixed(2)}</Text>
                        <Text style={[styles.memberDetailsLabel, { color: textSecondary }]}>Owes in this group</Text>
                      </View>
                      <View style={[styles.memberDetailsCard, { backgroundColor: bg }]}>
                        <Text style={[styles.memberDetailsValue, { color: "#34C759" }]}>${memberDetails.owedToInGroup.toFixed(2)}</Text>
                        <Text style={[styles.memberDetailsLabel, { color: textSecondary }]}>Is owed in this group</Text>
                      </View>
                    </View>
                    {memberDetailsMember?.userId && (() => {
                      const memberId = memberDetailsMember.userId;
                      const theyOwe = (balancesList || []).filter((b) => b.fromUserId === memberId && Number(b.amount ?? 0) >= 0.01);
                      const owedToThem = (balancesList || []).filter((b) => b.toUserId === memberId && Number(b.amount ?? 0) >= 0.01);
                      return (
                        <>
                          <Text style={[styles.memberDetailsSectionTitle, { color: textSecondary }]}>What they owe</Text>
                          {theyOwe.length === 0 ? (
                            <Text style={[styles.memberDetailsEmptyLine, { color: textSecondary }]}>Nothing</Text>
                          ) : (
                            theyOwe.map((b, i) => (
                              <View key={`owe-${i}`} style={[styles.memberDetailsBreakdownRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                                <Text style={[styles.memberDetailsBreakdownText, { color: textPrimary }]}>They owe {memberNames[b.toUserId] ?? "someone"} ${Number(b.amount ?? 0).toFixed(2)}</Text>
                              </View>
                            ))
                          )}
                          <Text style={[styles.memberDetailsSectionTitle, { color: textSecondary }]}>Who owes them</Text>
                          {owedToThem.length === 0 ? (
                            <Text style={[styles.memberDetailsEmptyLine, { color: textSecondary }]}>No one</Text>
                          ) : (
                            owedToThem.map((b, i) => (
                              <View key={`owed-${i}`} style={[styles.memberDetailsBreakdownRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                                <Text style={[styles.memberDetailsBreakdownText, { color: textPrimary }]}>{memberNames[b.fromUserId] ?? "Someone"} owes them ${Number(b.amount ?? 0).toFixed(2)}</Text>
                              </View>
                            ))
                          )}
                        </>
                      );
                    })()}
                  </ScrollView>
                ) : null}
                <TouchableOpacity
                  style={[styles.memberActionCancel, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", marginTop: 24 }]}
                  onPress={() => { setMemberDetailsVisible(false); setMemberDetails(null); setMemberDetailsMember(null); }}
                >
                  <Text style={[styles.memberActionCancelText, { color: textPrimary }]}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={addExpenseVisible} transparent animationType="slide">
        <View style={styles.addExpenseOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => { if (!expenseSubmitting) { setExpenseNeedsReview(false); setAddExpenseVisible(false); } }}
          />
          <GlassSurface isDark={isDarkMode} borderRadius={24} style={[LIQUID.shadow, styles.addExpenseSheet]}>
            <View style={styles.memberActionHandle} />
            <View style={styles.addExpenseHeader}>
              <Text style={[styles.addExpenseTitle, { color: textPrimary }]}>Add expense</Text>
              <TouchableOpacity onPress={() => { if (!expenseSubmitting) { setExpenseNeedsReview(false); setAddExpenseVisible(false); } }} hitSlop={12} style={styles.addExpenseCloseBtn}>
                <Text style={[styles.addExpenseCloseText, { color: IOS_BLUE }]}>Close</Text>
              </TouchableOpacity>
            </View>
            {expenseNeedsReview && (
              <View style={{ backgroundColor: "rgba(255,149,0,0.2)", paddingVertical: 8, paddingHorizontal: 16, marginHorizontal: 16, marginBottom: 8, borderRadius: 8 }}>
                <Text style={{ color: "#CC7A00", fontSize: 14, fontWeight: "600" }}>Needs review – verify total from receipt</Text>
              </View>
            )}
            <ScrollView style={styles.addExpenseScroll} contentContainerStyle={styles.addExpenseScrollContent} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalLabel, { color: textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
                value={expenseDesc}
                onChangeText={setExpenseDesc}
                placeholder="e.g. Dinner"
                placeholderTextColor={textSecondary}
              />
              <Text style={[styles.modalLabel, { color: textSecondary }]}>Amount</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder="0.00"
                placeholderTextColor={textSecondary}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.modalLabel, { color: textSecondary, marginTop: 16 }]}>Paid by</Text>
              <TouchableOpacity
                style={[styles.paidByRow, { backgroundColor: bg }]}
                onPress={() => { setPaidByPickerContext("add"); setPaidByPickerVisible(true); }}
              >
                <Text style={[styles.paidByRowLabel, { color: textPrimary }]} numberOfLines={1}>{paidByDisplayName}</Text>
                <ChevronRight size={20} color={textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.modalLabel, { color: textSecondary, marginTop: 20 }]}>Split with</Text>
              <View style={styles.expenseSplitModeRow}>
                <TouchableOpacity
                  style={[styles.expenseSplitModeBtn, expenseSplitMode === "all" && { backgroundColor: IOS_BLUE }]}
                  onPress={() => { setExpenseSplitMode("all"); setExpenseSelectedIds([...participantIds]); }}
                >
                  <Text style={[styles.expenseSplitModeBtnText, { color: expenseSplitMode === "all" ? "#FFF" : textPrimary }]}>All members</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.expenseSplitModeBtn, expenseSplitMode === "selected" && { backgroundColor: IOS_BLUE }]}
                  onPress={() => setExpenseSplitMode("selected")}
                >
                  <Text style={[styles.expenseSplitModeBtnText, { color: expenseSplitMode === "selected" ? "#FFF" : textPrimary }]}>Selected members</Text>
                </TouchableOpacity>
              </View>
              {expenseSplitMode === "selected" && (
                <View style={styles.expenseParticipantSection}>
                  <TouchableOpacity onPress={() => setExpenseSelectedIds([...participantIds])} style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, color: IOS_BLUE, fontWeight: "600" }}>Select all</Text>
                  </TouchableOpacity>
                  {members.map((m) => {
                    const uid = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
                    const name = m.name?.trim() || (m as { email?: string }).email || "Member";
                    const selected = uid && expenseSelectedIds.includes(uid);
                    return (
                      <TouchableOpacity
                        key={uid ?? name}
                        style={[styles.expenseParticipantRow, { backgroundColor: selected ? (isDarkMode ? "rgba(0,122,255,0.2)" : "rgba(0,122,255,0.15)") : bg }]}
                        onPress={() => {
                          if (!uid) return;
                          if (selected) {
                            if (expenseSelectedIds.length <= 1) return;
                            setExpenseSelectedIds(expenseSelectedIds.filter((id) => id !== uid));
                          } else {
                            setExpenseSelectedIds([...expenseSelectedIds, uid]);
                          }
                        }}
                      >
                        {selected ? <Check size={20} color={IOS_BLUE} /> : <Circle size={20} color={textSecondary} />}
                        <Text style={[styles.expenseParticipantName, { color: textPrimary }]} numberOfLines={1}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <Text style={[styles.modalHint, { color: textSecondary }]}>
                {expenseSplitMode === "all"
                  ? `Split equally among all ${participantIds.length} members`
                  : `Split equally among ${expenseSelectedIds.length} selected member${expenseSelectedIds.length !== 1 ? "s" : ""}`}
              </Text>
            </ScrollView>
            <View style={styles.addExpenseFooter}>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: IOS_BLUE }]}
                onPress={handleAddExpense}
                disabled={expenseSubmitting}
              >
                {expenseSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSubmitText}>Add</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddExpenseVisible(false)} style={styles.modalCancel}>
                <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </GlassSurface>
        </View>
      </Modal>

      {/* Payer picker bottom sheet (Add / Edit expense) */}
      <Modal visible={paidByPickerVisible} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          activeOpacity={1}
          onPress={() => setPaidByPickerVisible(false)}
        >
          <View style={[styles.payerPickerSheet, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]} onStartShouldSetResponder={() => true}>
            <View style={styles.memberActionHandle} />
            <Text style={[styles.payerPickerTitle, { color: textPrimary }]}>Paid by</Text>
            {members.map((m) => {
              const uid = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
              const name = m.name?.trim() || (m as { email?: string }).email || "Member";
              const selected = uid && expensePaidByUserId === uid;
              return (
                <TouchableOpacity
                  key={uid ?? name}
                  style={[styles.payerPickerRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
                  onPress={() => {
                    if (uid) setExpensePaidByUserId(uid);
                    setPaidByPickerVisible(false);
                  }}
                >
                  {selected ? <Check size={22} color={IOS_BLUE} /> : <Circle size={22} color={textSecondary} />}
                  <Text style={[styles.payerPickerRowText, { color: textPrimary }]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.memberActionCancel, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", marginTop: 16 }]} onPress={() => setPaidByPickerVisible(false)}>
              <Text style={[styles.memberActionCancelText, { color: textPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite / Add Person: iOS-style bottom sheet with 4 icon actions */}
      <Modal visible={inviteSheetVisible} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
          activeOpacity={1}
          onPress={() => setInviteSheetVisible(false)}
        >
          <View
            style={{
              backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag indicator */}
            <View
              style={{
                width: 40,
                height: 5,
                backgroundColor: "#E5E5EA",
                borderRadius: 3,
                alignSelf: "center",
                marginBottom: 24,
              }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                textAlign: "center",
                marginBottom: 24,
                color: textPrimary,
              }}
            >
              Invite people
            </Text>

            {/* 4 circular icon buttons */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 }}>
              <TouchableOpacity
                onPress={async () => {
                  setInviteSheetVisible(false);
                  setInviteLinkLoading(true);
                  setInviteFeedback(null);
                  try {
                    const safeToken = authToken || "dev-token";
                    const { token } = await createGroupInviteLink(safeToken, id as string);
                    const deepLink = `smartbudget://join/${token}`;
                    await Share.share({
                      message: `Join my SmartBudget group "${dashboard?.group?.name ?? "Group"}": ${deepLink}`,
                      url: deepLink,
                      title: "Invite to group",
                    });
                    setInviteFeedback("Invite link shared.");
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Invite link could not be created.";
                    setInviteFeedback(msg);
                    Alert.alert("Invite with link", msg);
                  } finally {
                    setInviteLinkLoading(false);
                  }
                }}
                style={{ alignItems: "center" }}
                disabled={inviteLinkLoading}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: "#F2F2F7",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {inviteLinkLoading ? <ActivityIndicator size="small" color="#007AFF" /> : <Link size={28} color="#007AFF" />}
                </View>
                <Text style={{ fontSize: 12, marginTop: 8, textAlign: "center", color: textPrimary }}>Invite with link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setInviteSheetVisible(false);
                  setAddPersonManualVisible(true);
                }}
                style={{ alignItems: "center" }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: "#F2F2F7",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <PenLine size={28} color="#007AFF" />
                </View>
                <Text style={{ fontSize: 12, marginTop: 8, textAlign: "center", color: textPrimary }}>Manual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setInviteSheetVisible(false);
                  setContactsLoading(true);
                  setContactsList([]);
                  try {
                    const Contacts = await import("expo-contacts");
                    const { status } = await Contacts.requestPermissionsAsync();
                    if (status !== "granted") {
                      Alert.alert("Permission needed", "Contacts access is required to add from contacts.");
                      setContactsLoading(false);
                      return;
                    }
                    const { data } = await Contacts.getContactsAsync({
                      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
                    });
                    const list = (data ?? []).map((c) => ({
                      id: c.id,
                      name: c.name ?? null,
                      phone: c.phoneNumbers?.[0]?.number ?? undefined,
                      email: c.emails?.[0]?.email ?? undefined,
                    }));
                    setContactsList(list);
                    setAddPersonContactsVisible(true);
                    if (list.length === 0) {
                      Alert.alert("No contacts found", "Add a member by name or email instead.");
                    }
                  } catch (e) {
                    Alert.alert("Contacts unavailable", "Permission denied or contacts could not be loaded. Add a member by name or email instead.");
                  } finally {
                    setContactsLoading(false);
                  }
                }}
                style={{ alignItems: "center" }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: "#F2F2F7",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Contact size={28} color="#007AFF" />
                </View>
                <Text style={{ fontSize: 12, marginTop: 8, textAlign: "center", color: textPrimary }}>Contacts</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setInviteSheetVisible(false);
                  setInviteLinkLoading(true);
                  setInviteFeedback(null);
                  try {
                    const safeToken = authToken || "dev-token";
                    const { token } = await createGroupInviteLink(safeToken, id as string);
                    const deepLink = `smartbudget://join/${token}`;
                    await Share.share({
                      message: `Join my SmartBudget group "${dashboard?.group?.name ?? "Group"}": ${deepLink}`,
                      url: deepLink,
                      title: "Add with AirDrop",
                    });
                    setInviteFeedback("Invite sent.");
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Couldn't complete invite, try again.";
                    setInviteFeedback(msg);
                    Alert.alert("Add with AirDrop", msg);
                  } finally {
                    setInviteLinkLoading(false);
                  }
                }}
                style={{ alignItems: "center" }}
                disabled={inviteLinkLoading}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: "#F2F2F7",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {inviteLinkLoading ? <ActivityIndicator size="small" color="#007AFF" /> : <Radio size={28} color="#007AFF" />}
                </View>
                <Text style={{ fontSize: 12, marginTop: 8, textAlign: "center", color: textPrimary }}>Add with AirDrop</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.inviteSheetCopyRow, { borderTopColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
              onPress={async () => {
                setInviteSheetVisible(false);
                setInviteLinkLoading(true);
                try {
                  const safeToken = authToken || "dev-token";
                  const { token, inviteUrl } = await createGroupInviteLink(safeToken, id as string);
                  const deepLink = `smartbudget://join/${token}`;
                  const copyText = `App: ${deepLink}\nWeb: ${inviteUrl}`;
                  await Clipboard.setStringAsync(copyText);
                  setInviteFeedback("Invite link copied.");
                  setTimeout(() => setInviteFeedback(null), 3000);
                  Alert.alert("Invite link copied", "App link and web link are in your clipboard.", [
                    { text: "OK" },
                    { text: "Share", onPress: () => Share.share({ message: copyText, url: deepLink, title: "Invite to group" }) },
                  ]);
                } catch (e) {
                  Alert.alert("Invite link", e instanceof Error ? e.message : "Could not create link.");
                } finally {
                  setInviteLinkLoading(false);
                }
              }}
              disabled={inviteLinkLoading}
            >
              <Link size={20} color={IOS_BLUE} />
              <Text style={[styles.inviteSheetCopyText, { color: textPrimary }]}>Copy invite link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setInviteSheetVisible(false)}
              style={{ marginTop: 30, padding: 16, backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", borderRadius: 12 }}
            >
              <Text style={{ textAlign: "center", fontWeight: "600", color: textPrimary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Person: Manual (name only) */}
      <Modal visible={addPersonManualVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !addPersonSubmitting && setAddPersonManualVisible(false)}
        >
          <View onStartShouldSetResponder={() => true}>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.modalCard]}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Add Person</Text>
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
              value={newMemberName}
              onChangeText={setNewMemberName}
              placeholder="e.g. Alex"
              placeholderTextColor={textSecondary}
              editable={!addPersonSubmitting}
            />
            <TouchableOpacity
              style={[styles.modalSubmit, { backgroundColor: IOS_BLUE }]}
              onPress={async () => {
                const name = newMemberName.trim();
                if (!name) {
                  Alert.alert("Invalid", "Enter a name.");
                  return;
                }
                if (!id) return;
                setAddPersonSubmitting(true);
                try {
                  const safeToken = authToken || "dev-token";
                  await addGroupMember(safeToken, id, { name });
                  setNewMemberName("");
                  setAddPersonManualVisible(false);
                  await load();
                  setInviteFeedback(`${name} added to the group.`);
                  setTimeout(() => setInviteFeedback(null), 3000);
                } catch (e) {
                  Alert.alert("Add member failed", e instanceof Error ? e.message : String(e));
                } finally {
                  setAddPersonSubmitting(false);
                }
              }}
              disabled={addPersonSubmitting}
            >
              {addPersonSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.modalSubmitText}>Add Member</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAddPersonManualVisible(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            </GlassSurface>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Person: Contacts modal (iOS-style) */}
      <Modal visible={addPersonContactsVisible} transparent animationType="slide">
        <View style={[styles.contactsModalFull, { backgroundColor: bg }]}>
          <View style={styles.contactsModalHeader}>
            <Text style={[styles.contactsModalTitle, { color: textPrimary }]}>Contacts</Text>
            <TouchableOpacity onPress={() => { setAddPersonContactsVisible(false); setContactsSearchQuery(""); }} hitSlop={12}>
              <Text style={[styles.contactsModalCancel, { color: IOS_BLUE }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {contactsLoading ? (
            <ActivityIndicator color={IOS_BLUE} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.contactsSearchWrapper}>
                <Search size={18} color="#8E8E93" style={styles.contactsSearchIcon} />
                <TextInput
                  style={styles.contactsSearchInput}
                  value={contactsSearchQuery}
                  onChangeText={setContactsSearchQuery}
                  placeholder="Search"
                  placeholderTextColor="#8E8E93"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <FlatList
                data={contactsList.filter((c) =>
                  (c.name ?? "").toLowerCase().includes(contactsSearchQuery.trim().toLowerCase())
                )}
                keyExtractor={(c) => c.id}
                style={styles.contactsList}
                ItemSeparatorComponent={() => <View style={styles.contactsRowSeparator} />}
                renderItem={({ item }) => {
                  const name = item.name ?? "No name";
                  const initials = name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <TouchableOpacity
                      style={styles.contactsRowApple}
                      onPress={async () => {
                        setAddPersonContactsVisible(false);
                        setContactsSearchQuery("");
                        if (!id) return;
                        setAddPersonSubmitting(true);
                        try {
                          const safeToken = authToken || "dev-token";
                          await addGroupMember(safeToken, id, { name, email: item.email, phone: item.phone });
                          await load();
                          setInviteFeedback(`${name} added to the group.`);
                          setTimeout(() => setInviteFeedback(null), 3000);
                        } catch (e) {
                          Alert.alert("Add member failed", e instanceof Error ? e.message : String(e));
                        } finally {
                          setAddPersonSubmitting(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.contactsAvatar}>
                        <Text style={styles.contactsAvatarText}>{initials}</Text>
                      </View>
                      <View style={styles.contactsRowRight}>
                        <Text style={[styles.contactsRowName, { color: textPrimary }]} numberOfLines={1}>{name}</Text>
                        {item.phone ? (
                          <Text style={styles.contactsRowPhone} numberOfLines={1}>{item.phone}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </View>
      </Modal>

      {/* Trash: Wallet-style bottom sheet (Leave / Delete / Cancel) */}
      <Modal visible={trashSheetVisible} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setTrashSheetVisible(false)} />
          <View onStartShouldSetResponder={() => true}>
            <GlassSurface isDark={isDarkMode} borderRadius={20} style={[LIQUID.shadow, styles.bottomSheetCard]}>
              <TouchableOpacity
                style={styles.bottomSheetRow}
                onPress={() => {
                  setTrashSheetVisible(false);
                  Alert.alert(
                    "Leave Group",
                    "Are you sure you want to leave this group? You will need to be re-invited to rejoin.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Leave",
                        style: "destructive",
                        onPress: async () => {
                          if (!id) return;
                          try {
                            const safeToken = authToken || "dev-token";
                            await leaveGroup(safeToken, id);
                            router.replace("/(tabs)/shared");
                          } catch (e) {
                            Alert.alert("Error", e instanceof Error ? e.message : String(e));
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.bottomSheetRowText, { color: textPrimary }]}>Leave Group</Text>
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.bottomSheetRow, styles.bottomSheetRowDestructive]}
                  onPress={() => {
                    setTrashSheetVisible(false);
                    handleDeleteGroup();
                  }}
                  disabled={deleteSubmitting}
                >
                  <Text style={styles.bottomSheetRowDestructiveText}>Delete Group</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.bottomSheetRow} onPress={() => setTrashSheetVisible(false)}>
                <Text style={[styles.bottomSheetRowText, { color: textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </GlassSurface>
          </View>
        </View>
      </Modal>

      {/* Expense split details (Splitwise-style) */}
      <Modal visible={!!selectedExpense} transparent animationType="slide">
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectedExpense(null)} />
          {selectedExpense && (
            <View onStartShouldSetResponder={() => true}>
              <GlassSurface isDark={isDarkMode} borderRadius={20} style={[LIQUID.shadow, styles.expenseDetailCard]}>
              <View style={styles.expenseDetailHeader}>
                <Text style={[styles.expenseDetailTitle, { color: textPrimary }]}>{selectedExpense.description || "Expense"}</Text>
                <TouchableOpacity onPress={() => setSelectedExpense(null)} hitSlop={12}>
                  <Text style={[styles.addExpenseCloseText, { color: IOS_BLUE }]}>Close</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.expenseDetailScroll} contentContainerStyle={styles.expenseDetailScrollContent} showsVerticalScrollIndicator={false}>
              <Text style={[styles.expenseDetailAmount, { color: textPrimary }]}>${selectedExpense.amount.toFixed(2)}</Text>
              <Text style={[styles.expenseDetailSubheader, { color: textSecondary }]}>
                Paid by {selectedExpense.paidBy?.name ?? (selectedExpense.paidBy?.id ? memberNames[selectedExpense.paidBy.id] : null) ?? "Someone"}
              </Text>
              <Text style={[styles.expenseDetailMeta, { color: textSecondary }]}>
                {selectedExpense.createdAt ? new Date(selectedExpense.createdAt).toLocaleDateString() : "—"}
                {" · "}
                {selectedExpense.splits && selectedExpense.splits.length > 0
                  ? `Split equally among ${selectedExpense.splits.length} participant${selectedExpense.splits.length !== 1 ? "s" : ""}`
                  : "Split equally"}
              </Text>
              <Text style={[styles.expenseDetailSourceLabel, { color: textSecondary }]}>
                {(selectedExpense.receiptId ?? selectedExpense.receipt) ? "From scanned receipt" : "Manual expense"}
              </Text>
              {(selectedExpense.receiptId ?? selectedExpense.receipt) && (
                <>
                  <View style={styles.expenseDetailDivider} />
                  <View style={[styles.receiptSourceCard, { backgroundColor: bg }]}>
                    <View style={styles.receiptSourceHeader}>
                      <Receipt size={20} color={textSecondary} />
                      <Text style={[styles.receiptSourceLabel, { color: textSecondary }]}>From scanned receipt</Text>
                    </View>
                    {selectedExpense.receipt?.store?.name && (
                      <Text style={[styles.receiptSourceMeta, { color: textPrimary }]}>Store: {selectedExpense.receipt.store.name}</Text>
                    )}
                    {selectedExpense.receipt?.date && (
                      <Text style={[styles.receiptSourceMeta, { color: textSecondary }]}>
                        Receipt date: {new Date(selectedExpense.receipt.date).toLocaleDateString()}
                      </Text>
                    )}
                    {selectedExpense.receipt?.user?.name && (
                      <Text style={[styles.receiptSourceMeta, { color: textSecondary }]}>Uploaded by {selectedExpense.receipt.user.name}</Text>
                    )}
                    {selectedExpense.receipt?.items && selectedExpense.receipt.items.length > 0 && (
                      <View style={styles.receiptItemsBlock}>
                        <Text style={[styles.receiptItemsLabel, { color: textSecondary }]}>Line items</Text>
                        {selectedExpense.receipt.items.slice(0, 10).map((item, i) => (
                          <View key={`item-${i}`} style={styles.receiptItemRow}>
                            <Text style={[styles.receiptItemName, { color: textPrimary }]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[styles.receiptItemPrice, { color: textSecondary }]}>${Number(item.totalPrice).toFixed(2)}</Text>
                          </View>
                        ))}
                        {selectedExpense.receipt.items.length > 10 && (
                          <Text style={[styles.receiptItemsMore, { color: textSecondary }]}>{selectedExpense.receipt.items.length - 10} more</Text>
                        )}
                      </View>
                    )}
                    {(() => {
                      const receiptUrl = selectedExpense.receiptUrl ?? selectedExpense.receipt?.imageUrl;
                      const hasReceiptUrl = typeof receiptUrl === "string" && receiptUrl.trim() !== "";
                      if (!hasReceiptUrl) return null;
                      return (
                        <TouchableOpacity
                          style={[styles.viewReceiptBtn, { backgroundColor: IOS_BLUE }]}
                          onPress={() => Linking.openURL(receiptUrl).catch(() => {})}
                        >
                          <ExternalLink size={18} color="#FFF" />
                          <Text style={styles.viewReceiptBtnText}>View receipt</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                </>
              )}
              <View style={styles.expenseDetailDivider} />
              {selectedExpense.splits && selectedExpense.splits.length > 0 ? (
                <>
                  <Text style={[styles.expenseDetailSectionLabel, { color: textSecondary }]}>Split breakdown</Text>
                  {selectedExpense.splits.map((s, i) => {
                    const name = s.user?.name ?? memberNames[s.userId] ?? "Someone";
                    const pct = selectedExpense.amount > 0 ? (s.amountOwed / selectedExpense.amount) * 100 : 0;
                    return (
                      <View key={`s-${i}`} style={[styles.expenseDetailRow, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
                        <Text style={[styles.expenseDetailRowName, { color: textPrimary }]}>{name}</Text>
                        <Text style={[styles.expenseDetailRowOwed, { color: textSecondary }]}>
                          Owes ${Number(s.amountOwed).toFixed(2)} ({pct.toFixed(0)}%)
                        </Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                <>
                  <Text style={[styles.expenseDetailSectionLabel, { color: textSecondary }]}>
                    Split equally among {members.length || 1} people
                  </Text>
                  {members.map((m) => {
                    const uid = (m as { userId?: string }).userId;
                    const name = m.name?.trim() || m.email || "Member";
                    const count = members.length || 1;
                    const owed = selectedExpense.amount / count;
                    const pct = 100 / count;
                    return (
                      <View key={uid ?? name} style={[styles.expenseDetailRow, { borderBottomColor: "rgba(255,255,255,0.1)" }]}>
                        <Text style={[styles.expenseDetailRowName, { color: textPrimary }]}>{name}</Text>
                        <Text style={[styles.expenseDetailRowOwed, { color: textSecondary }]}>
                          Owes ${owed.toFixed(2)} ({pct.toFixed(0)}%)
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}
              <TouchableOpacity
                style={[styles.expenseDetailEditBtn, { backgroundColor: IOS_BLUE }]}
                onPress={() => {
                  if (!selectedExpense) return;
                  const splitUserIds = selectedExpense.splits?.map((s) => s.userId).filter((uid) => participantIds.includes(uid)) ?? [];
                  setEditingExpenseId(selectedExpense.id);
                  setExpenseDesc(selectedExpense.description ?? "");
                  setExpenseAmount(selectedExpense.amount.toFixed(2));
                  setExpensePaidByUserId(selectedExpense.paidBy?.id ?? currentUserId ?? null);
                  setExpenseSplitMode("selected");
                  const initialSelected = splitUserIds.length > 0 ? splitUserIds : [...participantIds];
                  setExpenseSelectedIds(initialSelected.length > 0 ? initialSelected : [...participantIds]);
                  setSelectedExpense(null);
                  setEditExpenseVisible(true);
                }}
              >
                <Users size={18} color="#FFF" />
                <Text style={[styles.expenseDetailEditBtnText, { color: "#FFF" }]}>Add/remove participants</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.expenseDetailEditBtn, { backgroundColor: bg, borderColor: textSecondary }]}
                onPress={() => {
                  if (!selectedExpense) return;
                  const splitUserIds = selectedExpense.splits?.map((s) => s.userId).filter((uid) => participantIds.includes(uid)) ?? [];
                  setEditingExpenseId(selectedExpense.id);
                  setExpenseDesc(selectedExpense.description ?? "");
                  setExpenseAmount(selectedExpense.amount.toFixed(2));
                  setExpensePaidByUserId(selectedExpense.paidBy?.id ?? currentUserId ?? null);
                  setExpenseSplitMode("selected");
                  const initialSelected = splitUserIds.length > 0 ? splitUserIds : [...participantIds];
                  setExpenseSelectedIds(initialSelected.length > 0 ? initialSelected : [...participantIds]);
                  setSelectedExpense(null);
                  setEditExpenseVisible(true);
                }}
              >
                <Pencil size={18} color={textPrimary} />
                <Text style={[styles.expenseDetailEditBtnText, { color: textPrimary }]}>Edit expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.expenseDetailDeleteBtn, { backgroundColor: "#FF3B30" }]}
                disabled={expenseDeleteLoading}
                onPress={() => {
                  if (!selectedExpense || !authToken) return;
                  Alert.alert(
                    "Delete expense",
                    "This will remove the expense and update group balances. This cannot be undone.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          setExpenseDeleteLoading(true);
                          try {
                            await deleteExpense(authToken, selectedExpense.id);
                            setSelectedExpense(null);
                            await load();
                            setInviteFeedback("Expense deleted.");
                            setTimeout(() => setInviteFeedback(null), 3000);
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "";
                            Alert.alert("Could not delete expense", msg && !/Prisma|Invalid|raw/i.test(msg) ? msg : "Please try again.");
                          } finally {
                            setExpenseDeleteLoading(false);
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                {expenseDeleteLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.expenseDetailDeleteBtnText}>Delete expense</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.expenseDetailClose, { backgroundColor: IOS_BLUE }]} onPress={() => setSelectedExpense(null)}>
                <Text style={styles.expenseDetailCloseText}>Done</Text>
              </TouchableOpacity>
              </ScrollView>
              </GlassSurface>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit expense modal */}
      <Modal visible={editExpenseVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !expenseSubmitting && setEditExpenseVisible(false)}
          />
          <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.modalCard, styles.editModalCard]}>
            <ScrollView style={styles.editModalScroll} contentContainerStyle={styles.editModalScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Edit expense</Text>
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
              value={expenseDesc}
              onChangeText={setExpenseDesc}
              placeholder="e.g. Dinner"
              placeholderTextColor={textSecondary}
            />
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Amount</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: bg, color: textPrimary }]}
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              placeholder="0.00"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.modalLabel, { color: textSecondary, marginTop: 8 }]}>Paid by</Text>
            <TouchableOpacity
              style={[styles.paidByRow, { backgroundColor: bg }]}
              onPress={() => { setPaidByPickerContext("edit"); setPaidByPickerVisible(true); }}
            >
              <Text style={[styles.paidByRowLabel, { color: textPrimary }]} numberOfLines={1}>{paidByDisplayName}</Text>
              <ChevronRight size={20} color={textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.modalLabel, { color: textSecondary, marginTop: 16 }]}>Split with</Text>
            <View style={styles.expenseSplitModeRow}>
              <TouchableOpacity
                style={[styles.expenseSplitModeBtn, expenseSplitMode === "all" && { backgroundColor: IOS_BLUE }]}
                onPress={() => { setExpenseSplitMode("all"); setExpenseSelectedIds([...participantIds]); }}
              >
                <Text style={[styles.expenseSplitModeBtnText, { color: expenseSplitMode === "all" ? "#FFF" : textPrimary }]}>All members</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.expenseSplitModeBtn, expenseSplitMode === "selected" && { backgroundColor: IOS_BLUE }]}
                onPress={() => setExpenseSplitMode("selected")}
              >
                <Text style={[styles.expenseSplitModeBtnText, { color: expenseSplitMode === "selected" ? "#FFF" : textPrimary }]}>Selected</Text>
              </TouchableOpacity>
            </View>
            {expenseSplitMode === "selected" && (
              <View style={styles.expenseParticipantSection}>
                <TouchableOpacity onPress={() => setExpenseSelectedIds([...participantIds])} style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: IOS_BLUE, fontWeight: "600" }}>Select all</Text>
                </TouchableOpacity>
                {members.map((m) => {
                  const uid = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
                  const name = m.name?.trim() || (m as { email?: string }).email || "Member";
                  const selected = uid && expenseSelectedIds.includes(uid);
                  return (
                    <TouchableOpacity
                      key={uid ?? name}
                      style={[styles.expenseParticipantRow, { backgroundColor: selected ? (isDarkMode ? "rgba(0,122,255,0.2)" : "rgba(0,122,255,0.15)") : bg }]}
                      onPress={() => {
                        if (!uid) return;
                        if (selected) {
                          if (expenseSelectedIds.length <= 1) return;
                          setExpenseSelectedIds(expenseSelectedIds.filter((id) => id !== uid));
                        } else {
                          setExpenseSelectedIds([...expenseSelectedIds, uid]);
                        }
                      }}
                    >
                      {selected ? <Check size={20} color={IOS_BLUE} /> : <Circle size={20} color={textSecondary} />}
                      <Text style={[styles.expenseParticipantName, { color: textPrimary }]} numberOfLines={1}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={[styles.modalHint, { color: textSecondary }]}>
              {expenseSplitMode === "all"
                ? `Split equally among all ${participantIds.length} members`
                : `Split equally among ${expenseSelectedIds.length} selected member${expenseSelectedIds.length !== 1 ? "s" : ""}`}
            </Text>
            <Text style={[styles.balanceWarningText, { color: textSecondary }]}>
              This expense already affects group balances. Updating it will recalculate who owes whom.
            </Text>
            <TouchableOpacity
              style={[styles.modalSubmit, { backgroundColor: IOS_BLUE }]}
              onPress={handleEditExpense}
              disabled={expenseSubmitting}
            >
              {expenseSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSubmitText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditExpenseVisible(false); setEditingExpenseId(null); }} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            </ScrollView>
          </GlassSurface>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backBtn: { width: 40 },
  headerTitleCentered: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
  gearBtn: { width: 40, alignItems: "flex-end" },
  editDeleteText: { fontSize: 15, fontWeight: "600" },
  actionSheetRow: { paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.2)" },
  actionSheetRowText: { fontSize: 17, fontWeight: "500" },
  contactsModalFull: { flex: 1, marginTop: 60, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  contactsModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.1)" },
  contactsModalTitle: { fontSize: 17, fontWeight: "600" },
  contactsModalCancel: { fontSize: 17, fontWeight: "400" },
  contactsSearchWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#E3E3E9", borderRadius: 10, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 12, paddingVertical: 10 },
  contactsSearchIcon: { marginRight: 8 },
  contactsSearchInput: { flex: 1, fontSize: 16, paddingVertical: 0, color: "#000" },
  contactsModalCard: { maxHeight: "70%" },
  contactsList: { flex: 1 },
  contactsRow: { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.15)" },
  contactsRowText: { fontSize: 16 },
  contactsRowApple: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 },
  contactsRowSeparator: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginLeft: 16 },
  contactsAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E3E3E9", justifyContent: "center", alignItems: "center", marginRight: 14 },
  contactsAvatarText: { fontSize: 15, fontWeight: "600", color: "#3A3A3C" },
  contactsRowRight: { flex: 1 },
  contactsRowName: { fontSize: 17, fontWeight: "600" },
  contactsRowPhone: { fontSize: 14, color: "#8E8E93", marginTop: 2 },
  bottomSheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  expenseDetailCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    minHeight: 280,
    maxHeight: "85%",
  },
  expenseDetailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  expenseDetailScroll: { flex: 1, minHeight: 200 },
  expenseDetailScrollContent: { paddingBottom: 24 },
  expenseDetailTitle: { fontSize: 20, fontWeight: "700", flex: 1 },
  expenseDetailAmount: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  expenseDetailSubheader: { fontSize: 15, marginBottom: 4 },
  expenseDetailMeta: { fontSize: 14, marginBottom: 4 },
  expenseDetailSourceLabel: { fontSize: 13, marginBottom: 16 },
  expenseDetailDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 12 },
  expenseDetailSectionLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  expenseDetailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  expenseDetailRowName: { fontSize: 16, fontWeight: "500" },
  expenseDetailRowOwed: { fontSize: 15 },
  expenseDetailEditBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  expenseDetailEditBtnText: { fontSize: 16, fontWeight: "600" },
  expenseDetailDeleteBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  expenseDetailDeleteBtnText: { fontSize: 16, fontWeight: "600", color: "#FFF" },
  expenseDetailClose: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  expenseDetailCloseText: { fontSize: 17, fontWeight: "600", color: "#FFF" },
  receiptSourceCard: { padding: 14, borderRadius: 12, marginBottom: 4 },
  receiptSourceHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  receiptSourceLabel: { fontSize: 14, fontWeight: "600" },
  receiptSourceMeta: { fontSize: 13, marginBottom: 4 },
  receiptItemsBlock: { marginTop: 10, marginBottom: 10 },
  receiptItemsLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  receiptItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  receiptItemName: { fontSize: 14, flex: 1 },
  receiptItemPrice: { fontSize: 14 },
  receiptItemsMore: { fontSize: 12, marginTop: 4 },
  viewReceiptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 10, marginTop: 10 },
  viewReceiptBtnText: { fontSize: 15, fontWeight: "600", color: "#FFF" },
  bottomSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  bottomSheetRow: { paddingVertical: 18, paddingHorizontal: 4 },
  bottomSheetRowText: { fontSize: 18, fontWeight: "500" },
  bottomSheetRowDestructive: {},
  bottomSheetRowDestructiveText: { fontSize: 18, fontWeight: "600", color: "#FF3B30" },
  settingsMenuCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  settingsRowSwitch: { borderBottomWidth: 0 },
  settingsRowText: { fontSize: 16, fontWeight: "500" },
  settingsSubList: { paddingLeft: 16, paddingBottom: 8 },
  settingsSubRow: { paddingVertical: 12, paddingHorizontal: 4 },
  settingsSubText: { fontSize: 15 },
  settingsRowDestructive: { borderBottomWidth: 0, marginTop: 8 },
  settingsRowDestructiveText: { fontSize: 16, fontWeight: "600", color: "#FF3B30" },
  addPersonSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  addPersonLabel: { fontSize: 17, fontWeight: "600" },
  inviteFeedbackBar: { marginHorizontal: 16, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  inviteFeedbackText: { fontSize: 14, fontWeight: "500" },
  summaryCard: {
    marginBottom: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  summaryCardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 14 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  summaryItem: { minWidth: "22%" },
  summaryValue: { fontSize: 18, fontWeight: "800" },
  summaryLabel: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  summarySettlement: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  summarySettlementText: { fontSize: 14, fontWeight: "600" },
  settleAllBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 44 },
  settleAllBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  settlementDone: { fontSize: 16, fontWeight: "600" },
  membersCard: {
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  membersCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingTop: 8 },
  membersCardTitle: { fontSize: 17, fontWeight: "700" },
  membersCardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberPlusMinusBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberRowTouchable: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  memberMinusBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  memberRowAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 12 },
  memberRowInitials: { fontSize: 15, fontWeight: "700" },
  memberRowCenter: { flex: 1, minWidth: 0 },
  memberRowName: { fontSize: 16, fontWeight: "600" },
  memberRowBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  memberRowBadgeText: { fontSize: 11, fontWeight: "700" },
  memberActionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  memberActionHandle: { width: 40, height: 5, backgroundColor: "#E5E5EA", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
  memberActionHeader: { alignItems: "center", marginBottom: 20 },
  memberActionAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  memberActionInitials: { fontSize: 20, fontWeight: "700" },
  memberActionName: { fontSize: 18, fontWeight: "700" },
  memberActionRole: { fontSize: 14, marginTop: 2 },
  memberActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  memberActionRowText: { fontSize: 17, fontWeight: "500" },
  memberActionRowDestructive: { borderBottomWidth: 0 },
  memberActionRowDestructiveText: { fontSize: 17, fontWeight: "600", color: "#FF3B30" },
  memberActionHelper: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
  memberActionCancel: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  memberActionCancelText: { fontSize: 17, fontWeight: "600" },
  memberDetailsScroll: { maxHeight: 360 },
  memberDetailsScrollContent: { paddingBottom: 16 },
  memberDetailsSectionTitle: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  memberDetailsBreakdownRow: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  memberDetailsBreakdownText: { fontSize: 15 },
  memberDetailsEmptyLine: { fontSize: 14, fontStyle: "italic", paddingVertical: 4 },
  memberDetailsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  memberDetailsTitle: { fontSize: 20, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  memberDetailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  memberDetailsCard: { flex: 1, minWidth: "30%", padding: 16, borderRadius: 12 },
  memberDetailsValue: { fontSize: 18, fontWeight: "800" },
  memberDetailsLabel: { fontSize: 12, fontWeight: "500", marginTop: 4 },
  inviteSheetCopyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inviteSheetCopyText: { fontSize: 17, fontWeight: "500" },
  expenseRowCompact: {
    marginBottom: 8,
  },
  expenseRowCompactInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  expenseAmountRight: { fontSize: 16, fontWeight: "700", marginLeft: 8 },
  balanceRowVisual: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  balanceAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  balanceAvatarText: { fontSize: 12, fontWeight: "700" },
  balanceDebtorName: { fontSize: 14, fontWeight: "600", width: 72 },
  balanceCreditorName: { fontSize: 14, fontWeight: "600", width: 72 },
  balanceArrow: { fontSize: 14, fontWeight: "600" },
  balanceAmountRight: { fontSize: 16, fontWeight: "700" },
  settleBtnCompact: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  addBtnFab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  membersRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberChipAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  memberChipInitials: { fontSize: 13, fontWeight: "700" },
  memberChipName: { fontSize: 15, fontWeight: "500", maxWidth: 120 },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  heroLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  heroTotal: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  heroBalance: { fontSize: 15, fontWeight: "600", marginBottom: 12 },
  heroBalancesExpand: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  heroBalancesTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  heroBalanceItem: { marginBottom: 12 },
  heroBalanceItemText: { fontSize: 14, marginBottom: 4 },
  heroBalanceTrack: { height: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 8, paddingHorizontal: 16 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },
  pricesOuter: { flex: 1, paddingHorizontal: 16 },
  bottomSpacer: { height: 24 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  tabBtnActive: { backgroundColor: IOS_BLUE },
  tabBtnText: { fontSize: 15, fontWeight: "600" },
  priceSearchWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10 },
  priceSearchIcon: { marginRight: 8 },
  priceSearchInput: { flex: 1, fontSize: 16, paddingVertical: 0, color: "#000" },
  priceList: { flex: 1 },
  priceListContent: { paddingBottom: 24 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 16, marginBottom: 8, borderRadius: 12 },
  priceRowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  priceRowIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 12 },
  priceRowIconText: { fontSize: 14, fontWeight: "700" },
  priceRowMiddle: { flex: 1 },
  priceRowName: { fontSize: 16, fontWeight: "600" },
  priceRowStore: { fontSize: 13, marginTop: 2 },
  priceRowDate: { fontSize: 11, marginTop: 2 },
  priceRowRight: { alignItems: "flex-end" },
  priceRowPrice: { fontSize: 16, fontWeight: "700" },
  priceRowUnit: { fontSize: 12, marginTop: 2 },
  empty: { paddingVertical: 16, paddingHorizontal: 16, fontSize: 14 },
  expenseRow: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  expenseLeft: { flex: 1 },
  expenseRowTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  expenseReceiptIcon: { marginRight: 4 },
  expenseDesc: { fontSize: 16, fontWeight: "600", flex: 1 },
  expenseMeta: { fontSize: 13, marginTop: 4 },
  expenseDate: { fontSize: 12, marginTop: 2 },
  expenseAmount: { fontSize: 16, fontWeight: "700" },
  balanceRow: { padding: 16, borderRadius: 12, marginBottom: 8 },
  balanceText: { fontSize: 15, fontWeight: "500", flex: 1 },
  settleBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignSelf: "flex-start" },
  settleBtnText: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  activityRow: { padding: 14, borderRadius: 12, marginBottom: 8 },
  activityText: { fontSize: 15, fontWeight: "500" },
  activityDate: { fontSize: 12, marginTop: 4 },
  addBtn: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: IOS_BLUE,
    paddingVertical: 16,
    borderRadius: 14,
  },
  addBtnText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  addExpenseOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  addExpenseSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  addExpenseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  addExpenseTitle: { fontSize: 20, fontWeight: "700" },
  addExpenseCloseBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  addExpenseCloseText: { fontSize: 17, fontWeight: "500" },
  addExpenseScroll: { maxHeight: 400 },
  addExpenseScrollContent: { paddingBottom: 16 },
  addExpenseFooter: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.15)" },
  paidByRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  paidByRowLabel: { fontSize: 16, fontWeight: "500", flex: 1 },
  payerPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  payerPickerTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  payerPickerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  payerPickerRowText: { fontSize: 17, fontWeight: "500", flex: 1 },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
  },
  editModalCard: { maxHeight: "85%" },
  editModalScroll: { flex: 1 },
  editModalScrollContent: { paddingBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  modalLabel: { fontSize: 14, marginBottom: 6 },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalHint: { fontSize: 12, marginBottom: 16 },
  balanceWarningText: { fontSize: 13, fontStyle: "italic", marginBottom: 16 },
  expenseSplitModeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  expenseSplitModeBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,122,255,0.5)" },
  expenseSplitModeBtnText: { fontSize: 15, fontWeight: "600" },
  expenseParticipantSection: { maxHeight: 180, marginBottom: 12 },
  expenseParticipantRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6 },
  expenseParticipantName: { fontSize: 15, fontWeight: "500", flex: 1 },
  modalSubmit: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  modalSubmitText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  deleteBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 8 },
  deleteBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
  modalCancelText: { fontSize: 15 },
});
