import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { X, Trash2, Users, Check, Circle, ArrowLeft, CheckCircle, Stethoscope } from "lucide-react-native";
import {
  getReceipts,
  getReceiptImageDataUri,
  deleteTransaction,
  approveReceipt,
  getGroups,
  getGroupDashboard,
  setReceiptGroup,
  shareReceiptToGroup,
  getReceiptMedicalSuggestions,
  addReceiptToMedical,
  getMedicalFolders,
  updateReceiptItem,
  updateReceiptDate,
  getMyHousehold,
  getHouseholdReceipts,
  type GroupRow,
  type HouseholdReceiptRow,
} from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";

function triggerDashboardRefresh() {
  useStore.getState().triggerDashboardRefresh();
}

const ITEM_CATEGORIES = [
  "Groceries", "Household", "Personal Care", "Health", "Baby", "Pet", "Electronics", "Dining",
  "Gas", "Transportation", "Banking", "Clothing", "Subscriptions", "Entertainment",
  "Education", "Gifts & Donations", "Other",
];
type ReceiptItem = { id?: string; name?: string; rawName?: string; totalPrice?: number; category?: string; subcategory?: string | null };
type ReceiptWithStore = {
  id: string;
  total: number;
  date?: string;
  imageUrl: string | null;
  store: { name: string; id?: string };
  status?: string;
  items?: ReceiptItem[];
  uploadedBy?: { userId: string; name: string };
};

function loadReceipts(
  authToken: string | null,
  setReceipts: (r: ReceiptWithStore[]) => void,
  setLoading: (b: boolean) => void,
  setError: (s: string | null) => void,
  search?: string
) {
  setLoading(true);
  setError(null);
  getReceipts(authToken, search)
    .then((data) => {
      setReceipts(Array.isArray(data) ? data : []);
    })
    .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
    .finally(() => setLoading(false));
}

/** True when imageUrl is our backend receipt image endpoint (requires auth to load). Match by path so it works regardless of host. */
function isBackendReceiptImageUrl(imageUrl: string | null): boolean {
  if (!imageUrl || typeof imageUrl !== "string") return false;
  return imageUrl.includes("/api/receipts/") && imageUrl.includes("/image");
}

/** Thumbnail that fetches with auth when image is served by our API (so it displays instead of blank). */
function ReceiptThumbnail({
  receiptId,
  imageUrl,
  storeName,
  total,
  authToken,
  bg,
  textPrimary,
  textSecondary,
  onDeletePress,
  children,
}: {
  receiptId: string;
  imageUrl: string | null;
  storeName: string;
  total: number;
  authToken: string | null;
  bg: string;
  textPrimary: string;
  textSecondary: string;
  onDeletePress: () => void;
  children?: React.ReactNode;
}) {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isBackend = isBackendReceiptImageUrl(imageUrl);

  useEffect(() => {
    if (!isBackend) return;
    setLoading(true);
    // idToken may be null (guest); API client falls back to dev-token in development.
    getReceiptImageDataUri(authToken, receiptId)
      .then(setDataUri)
      .finally(() => setLoading(false));
  }, [receiptId, authToken, isBackend]);

  const uri = isBackend ? dataUri : imageUrl;
  return (
    <View style={libraryStyles.imageWrapOuter}>
      {uri ? (
        <Image source={{ uri }} style={libraryStyles.image} resizeMode="cover" />
      ) : loading ? (
        <View style={[libraryStyles.imagePlaceholder, { backgroundColor: bg }]}>
          <ActivityIndicator size="small" color={IOS_BLUE} />
        </View>
      ) : (
        <View style={[libraryStyles.imagePlaceholder, { backgroundColor: bg }]}>
          <Text style={[libraryStyles.placeholderStore, { color: textSecondary }]} numberOfLines={2}>{storeName}</Text>
          <Text style={[libraryStyles.placeholderTotal, { color: textPrimary }]}>{`$${total.toFixed(2)}`}</Text>
        </View>
      )}
      <TouchableOpacity style={libraryStyles.trashBtn} onPress={onDeletePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Trash2 size={20} color="#FFF" />
      </TouchableOpacity>
      {children}
    </View>
  );
}

const libraryStyles = {
  imageWrapOuter: { width: "100%", aspectRatio: 1, position: "relative" as const, backgroundColor: "transparent" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", alignItems: "center" as const, justifyContent: "center" as const, padding: 12 },
  placeholderStore: { fontSize: 13, textAlign: "center" as const, marginBottom: 4 },
  placeholderTotal: { fontSize: 18, fontWeight: "700" as const },
  trashBtn: {
    position: "absolute" as const,
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};

export default function LibraryModal() {
  const router = useRouter();
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const currentUserId = useStore((s) => s.user?.id ?? null);
  const [receipts, setReceipts] = useState<ReceiptWithStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [splitModalReceipt, setSplitModalReceipt] = useState<ReceiptWithStore | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [shareLoading, setShareLoading] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [groupMembers, setGroupMembers] = useState<{ id: string; userId?: string; name: string | null; email?: string }[]>([]);
  const [receiptSplitMode, setReceiptSplitMode] = useState<"all" | "selected">("all");
  const [receiptSelectedIds, setReceiptSelectedIds] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailReceipt, setDetailReceipt] = useState<ReceiptWithStore | null>(null);
  const [detailImageUri, setDetailImageUri] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [addToMedicalModal, setAddToMedicalModal] = useState(false);
  const [medicalFolders, setMedicalFolders] = useState<{ id: string; patientName: string }[]>([]);
  const [medicalSuggestions, setMedicalSuggestions] = useState<{ rxItemIds: string[]; allItemIds: string[] } | null>(null);
  const [selectedMedicalFolderId, setSelectedMedicalFolderId] = useState<string | null>(null);
  const [selectedMedicalItemIds, setSelectedMedicalItemIds] = useState<string[]>([]);
  const [addToMedicalLoading, setAddToMedicalLoading] = useState(false);
  const [editingCategoryItemId, setEditingCategoryItemId] = useState<string | null>(null);
  const [updateItemLoading, setUpdateItemLoading] = useState(false);
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [dateEditValue, setDateEditValue] = useState("");
  const [dateEditSaving, setDateEditSaving] = useState(false);
  const [householdReceipts, setHouseholdReceipts] = useState<HouseholdReceiptRow[]>([]);
  const [householdReceiptsLoading, setHouseholdReceiptsLoading] = useState(false);

  const refresh = useCallback(
    (search?: string) => {
      loadReceipts(authToken, setReceipts, setLoading, setError, search ?? (searchQuery || undefined));
    },
    [authToken, searchQuery]
  );

  useEffect(() => {
    refresh();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      setHouseholdReceipts([]);
      return;
    }
    setHouseholdReceiptsLoading(true);
    getMyHousehold(authToken)
      .then((res) => {
        if (res.household) {
          return getHouseholdReceipts(authToken).then(setHouseholdReceipts);
        }
        setHouseholdReceipts([]);
      })
      .catch(() => setHouseholdReceipts([]))
      .finally(() => setHouseholdReceiptsLoading(false));
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      if (detailReceipt) return;
      refresh();
      if (authToken) {
        getMyHousehold(authToken)
          .then((res) => {
            if (res.household) {
              return getHouseholdReceipts(authToken).then(setHouseholdReceipts);
            }
            setHouseholdReceipts([]);
          })
          .catch(() => setHouseholdReceipts([]));
      }
      return () => {};
    }, [authToken, refresh, detailReceipt])
  );

  useEffect(() => {
    if (!detailReceipt) {
      setDetailImageUri(null);
      return;
    }
    const url = detailReceipt.imageUrl ?? null;
    if (!isBackendReceiptImageUrl(url)) {
      setDetailImageUri(url || null);
      return;
    }
    let cancelled = false;
    setDetailImageUri(null);
    getReceiptImageDataUri(authToken, detailReceipt.id)
      .then((uri) => {
        if (!cancelled) setDetailImageUri(uri);
      });
    return () => { cancelled = true; };
  }, [detailReceipt?.id, detailReceipt?.imageUrl, authToken]);

  const openSplitModal = (r: ReceiptWithStore) => {
    setSplitModalReceipt(r);
    setSelectedGroup(null);
    getGroups(authToken).then((list) => setGroups(Array.isArray(list) ? list : [])).catch(() => setGroups([]));
  };

  const onSelectGroupForSplit = (g: GroupRow) => {
    setSelectedGroup({ id: g.id, name: g.name });
    setMembersLoading(true);
    getGroupDashboard(authToken, g.id)
      .then((d) => {
        const members = Array.isArray(d.members) ? d.members : [];
        const ids = members.map((m) => (m as { userId?: string }).userId ?? (m as { id?: string }).id).filter((id): id is string => Boolean(id));
        setGroupMembers(members);
        setReceiptSplitMode("all");
        setReceiptSelectedIds(ids);
      })
      .catch(() => setGroupMembers([]))
      .finally(() => setMembersLoading(false));
  };

  const participantIdsFromMembers = groupMembers.map((m) => (m as { userId?: string }).userId ?? (m as { id?: string }).id).filter((id): id is string => Boolean(id));

  const onDeletePress = (r: ReceiptWithStore) => {
    Alert.alert("Delete receipt", undefined, [
      {
        text: "Delete Entire Transaction",
        style: "destructive",
        onPress: () => {
          deleteTransaction(r.id, "all", authToken)
            .then(() => {
              triggerDashboardRefresh();
              refresh();
            })
            .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Delete failed"));
        },
      },
      {
        text: "Delete Photo Only",
        onPress: () => {
          deleteTransaction(r.id, "imageOnly", authToken)
            .then(() => {
              triggerDashboardRefresh();
              refresh();
            })
            .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Delete failed"));
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Receipt Library</Text>
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: glass }]} onPress={() => router.back()}>
          <X size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: glass }]}>
        <TextInput
          style={[styles.searchInput, { color: textPrimary, backgroundColor: bg }]}
          placeholder="Search by store or item name..."
          placeholderTextColor={textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => refresh(searchQuery)}
          returnKeyType="search"
        />
        <TouchableOpacity style={[styles.searchBtn, { backgroundColor: IOS_BLUE }]} onPress={() => refresh(searchQuery)} disabled={loading}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={IOS_BLUE} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: textSecondary }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {receipts.map((r) => {
            if (!r || typeof r.id !== "string") return null;
            const total = typeof r.total === "number" && Number.isFinite(r.total) ? r.total : 0;
            const storeName = r.store?.name ?? "Store";
            return (
            <View key={r.id} style={[styles.card, { backgroundColor: glass }]}>
              <TouchableOpacity onPress={() => setDetailReceipt(r)} activeOpacity={0.8} style={styles.cardTappable}>
                <View style={[styles.imageWrap, { backgroundColor: bg }]}>
                  <ReceiptThumbnail
                    receiptId={r.id}
                    imageUrl={r.imageUrl ?? null}
                    storeName={storeName}
                    total={total}
                    authToken={authToken}
                    bg={bg}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    onDeletePress={() => onDeletePress(r)}
                  />
                </View>
                <View style={styles.storeNameRow}>
                  <Text style={[styles.storeName, { color: textPrimary }]} numberOfLines={1}>
                    {storeName}
                  </Text>
                  {r.status === "NEEDS_REVIEW" && (
                    <View style={styles.needsReviewBadge}>
                      <Text style={styles.needsReviewText}>Review</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.amount}>${total.toFixed(2)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.splitBtn}
                onPress={() => openSplitModal(r)}
                activeOpacity={0.8}
              >
                <Users size={16} color={IOS_BLUE} />
                <Text style={styles.splitBtnText}>Split with Group</Text>
              </TouchableOpacity>
            </View>
          );
          })}
          {householdReceipts.length > 0 && (
            <>
              <View style={[styles.sectionHeaderWrap, { width: "100%" }]}>
                <Text style={[styles.sectionHeaderTitle, { color: textPrimary }]}>Household receipts</Text>
                <Text style={[styles.sectionHeaderSub, { color: textSecondary }]}>Shared with your household</Text>
              </View>
              {householdReceipts.map((r) => {
                const total = typeof r.total === "number" && Number.isFinite(r.total) ? r.total : 0;
                const storeName = r.store?.name ?? "Store";
                const asDetail: ReceiptWithStore = {
                  id: r.id,
                  total: r.total,
                  date: r.date,
                  imageUrl: r.imageUrl,
                  store: { name: r.store.name, id: r.store.id },
                  status: r.status,
                  items: r.items,
                  uploadedBy: r.uploadedBy,
                };
                return (
                  <View key={`household-${r.id}`} style={[styles.card, { backgroundColor: glass }]}>
                    <TouchableOpacity onPress={() => setDetailReceipt(asDetail)} activeOpacity={0.8} style={styles.cardTappable}>
                      <View style={[styles.imageWrap, { backgroundColor: bg }]}>
                        <ReceiptThumbnail
                          receiptId={r.id}
                          imageUrl={r.imageUrl ?? null}
                          storeName={storeName}
                          total={total}
                          authToken={authToken}
                          bg={bg}
                          textPrimary={textPrimary}
                          textSecondary={textSecondary}
                          onDeletePress={() => {}}
                        />
                      </View>
                      <View style={styles.storeNameRow}>
                        <Text style={[styles.storeName, { color: textPrimary }]} numberOfLines={1}>
                          {storeName}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { marginBottom: 2 }]}>${total.toFixed(2)}</Text>
                      <Text style={[styles.uploadedBy, { color: textSecondary }]} numberOfLines={1}>
                        Uploaded by {r.uploadedBy?.name ?? "Household"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={!!detailReceipt} transparent animationType="fade">
        <View style={styles.detailModalOverlay}>
          <View style={[styles.detailModalCard, { backgroundColor: glass }]}>
            <View style={styles.detailModalHeader}>
              <Text style={[styles.detailModalTitle, { color: textPrimary }]} numberOfLines={1}>
                {detailReceipt?.store?.name ?? "Receipt"}
              </Text>
              <TouchableOpacity onPress={() => setDetailReceipt(null)} hitSlop={12}>
                <X size={24} color={textPrimary} />
              </TouchableOpacity>
            </View>
            {detailReceipt && (
              <ScrollView
                style={styles.detailModalScroll}
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Full receipt image first (zoom-in / open feel) */}
                <View style={styles.detailImageSection}>
                  {detailImageUri ? (
                    <Image
                      source={{ uri: detailImageUri }}
                      style={styles.detailImageFull}
                      resizeMode="contain"
                    />
                  ) : detailReceipt.imageUrl && !isBackendReceiptImageUrl(detailReceipt.imageUrl) ? (
                    <Image
                      source={{ uri: detailReceipt.imageUrl }}
                      style={styles.detailImageFull}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.detailImagePlaceholder, { backgroundColor: bg }]}>
                      {detailReceipt.imageUrl && isBackendReceiptImageUrl(detailReceipt.imageUrl) ? (
                        <ActivityIndicator size="large" color={IOS_BLUE} />
                      ) : (
                        <>
                          <Text style={[styles.detailImagePlaceholderText, { color: textSecondary }]}>
                            No image
                          </Text>
                          <Text style={[styles.detailImagePlaceholderSub, { color: textSecondary }]}>
                            {detailReceipt.store?.name ?? "Receipt"} · ${typeof detailReceipt.total === "number" ? detailReceipt.total.toFixed(2) : "0.00"}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </View>
                {/* 2. Receipt data below the image */}
                <View style={[styles.detailDataSection, { borderTopColor: bg }]}>
                  <Text style={[styles.detailDataSectionTitle, { color: textSecondary }]}>Receipt details</Text>
                  {detailReceipt.uploadedBy && (
                    <Text style={[styles.detailUploadedBy, { color: textSecondary }]}>
                      Uploaded by {detailReceipt.uploadedBy.name}
                    </Text>
                  )}
                  <View style={styles.detailMeta}>
                    {detailReceipt.uploadedBy && detailReceipt.uploadedBy.userId !== currentUserId ? (
                      <Text style={[styles.detailDate, { color: textSecondary }]}>
                        {detailReceipt.date
                          ? new Date(detailReceipt.date).toLocaleDateString("en-US", { dateStyle: "medium" })
                          : "—"}
                      </Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          const d = detailReceipt.date;
                          setDateEditValue(d ? d.slice(0, 10) : new Date().toISOString().slice(0, 10));
                          setDateEditOpen(true);
                        }}
                      >
                        <Text style={[styles.detailDate, { color: textSecondary }]}>
                          {detailReceipt.date
                            ? new Date(detailReceipt.date).toLocaleDateString("en-US", { dateStyle: "medium" })
                            : "—"}
                        </Text>
                        <Text style={[styles.detailDateHint, { color: textSecondary }]}>Tap to edit date</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={[styles.detailTotal, { color: textPrimary }]}>
                      Total: ${typeof detailReceipt.total === "number" ? detailReceipt.total.toFixed(2) : "0.00"}
                    </Text>
                  </View>
                  {Array.isArray(detailReceipt.items) && detailReceipt.items.length > 0 && (
                    <View style={styles.detailItems}>
                      <Text style={[styles.detailItemsTitle, { color: textPrimary }]}>Items</Text>
                      {detailReceipt.items.map((item, idx) => (
                        <View key={item.id ?? idx} style={[styles.detailItemRow, { borderBottomColor: bg }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.detailItemName, { color: textPrimary }]} numberOfLines={2}>
                              {item.name ?? item.rawName ?? "Item"}
                            </Text>
                            <TouchableOpacity
                              style={[styles.categoryChip, { backgroundColor: isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" }]}
                              onPress={() => item.id && setEditingCategoryItemId(item.id)}
                              disabled={updateItemLoading || (!!detailReceipt?.uploadedBy && detailReceipt.uploadedBy.userId !== currentUserId)}
                            >
                              <Text style={[styles.categoryChipText, { color: textSecondary }]}>
                                {(item.category ?? "Other").trim() || "Other"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={[styles.detailItemPrice, { color: textPrimary }]}>
                            ${typeof item.totalPrice === "number" ? item.totalPrice.toFixed(2) : "0.00"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {detailReceipt.status === "NEEDS_REVIEW" && (!detailReceipt.uploadedBy || detailReceipt.uploadedBy.userId === currentUserId) && (
                    <TouchableOpacity
                      style={[styles.approveBtn, { backgroundColor: IOS_BLUE }]}
                      onPress={async () => {
                        if (!detailReceipt?.id) return;
                        setApproveLoading(true);
                        try {
                          await approveReceipt(detailReceipt.id, authToken);
                          triggerDashboardRefresh();
                          refresh();
                          setDetailReceipt(null);
                        } catch (e) {
                          Alert.alert("Error", e instanceof Error ? e.message : "Could not approve");
                        } finally {
                          setApproveLoading(false);
                        }
                      }}
                      disabled={approveLoading}
                    >
                      {approveLoading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <>
                          <CheckCircle size={20} color="#FFF" />
                          <Text style={styles.approveBtnText}>Approve (mark as verified)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  {(!detailReceipt.uploadedBy || detailReceipt.uploadedBy.userId === currentUserId) && (
                  <TouchableOpacity
                    style={[styles.addToMedicalBtn, { backgroundColor: bg, borderColor: IOS_BLUE }]}
                    onPress={async () => {
                      if (!detailReceipt?.id) return;
                      setAddToMedicalModal(true);
                      setSelectedMedicalFolderId(null);
                      try {
                        const [suggestions, folders] = await Promise.all([
                          getReceiptMedicalSuggestions(detailReceipt.id, authToken),
                          getMedicalFolders(authToken),
                        ]);
                        setMedicalSuggestions({
                          rxItemIds: suggestions.rxItemIds,
                          allItemIds: suggestions.allItemIds,
                        });
                        setMedicalFolders(folders.map((f) => ({ id: f.id, patientName: f.patientName })));
                        setSelectedMedicalItemIds(
                          suggestions.rxItemIds.length > 0 ? suggestions.rxItemIds : suggestions.allItemIds
                        );
                        if (folders.length === 1) setSelectedMedicalFolderId(folders[0].id);
                      } catch (e) {
                        Alert.alert("Error", e instanceof Error ? e.message : "Could not load");
                        setAddToMedicalModal(false);
                      }
                    }}
                  >
                    <Stethoscope size={20} color={IOS_BLUE} />
                    <Text style={[styles.addToMedicalBtnText, { color: IOS_BLUE }]}>Add to medical</Text>
                  </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={dateEditOpen && !!detailReceipt} transparent animationType="fade">
        <View style={styles.splitModalOverlay}>
          <View style={[styles.splitModalCard, { backgroundColor: glass }]}>
            <View style={styles.splitModalHeader}>
              <Text style={[styles.splitModalTitle, { color: textPrimary, flex: 1 }]}>Edit receipt date</Text>
              <TouchableOpacity onPress={() => setDateEditOpen(false)} hitSlop={12}>
                <X size={24} color={textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.splitModalLabel, { color: textSecondary }]}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.dateEditInput, { color: textPrimary, backgroundColor: bg }]}
              value={dateEditValue}
              onChangeText={setDateEditValue}
              placeholder="2024-01-15"
              placeholderTextColor={textSecondary}
              editable={!dateEditSaving}
            />
            <TouchableOpacity
              style={[styles.approveBtn, { backgroundColor: IOS_BLUE, marginTop: 12 }]}
              onPress={async () => {
                if (!detailReceipt?.id) return;
                const date = dateEditValue.trim().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  Alert.alert("Invalid date", "Use YYYY-MM-DD (e.g. 2024-01-15)");
                  return;
                }
                setDateEditSaving(true);
                try {
                  await updateReceiptDate(detailReceipt.id, date, authToken);
                  setDetailReceipt((prev) => (prev ? { ...prev, date } : null));
                  setDateEditOpen(false);
                  triggerDashboardRefresh();
                  refresh();
                } catch (e) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Could not update date");
                } finally {
                  setDateEditSaving(false);
                }
              }}
              disabled={dateEditSaving}
            >
              {dateEditSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.approveBtnText}>Save date</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingCategoryItemId && !!detailReceipt} transparent animationType="fade">
        <View style={styles.splitModalOverlay}>
          <View style={[styles.splitModalCard, { backgroundColor: glass }]}>
            <View style={styles.splitModalHeader}>
              <Text style={[styles.splitModalTitle, { color: textPrimary, flex: 1 }]}>Change category</Text>
              <TouchableOpacity onPress={() => setEditingCategoryItemId(null)} hitSlop={12}>
                <X size={24} color={textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {ITEM_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.splitGroupRow, { backgroundColor: bg }]}
                  onPress={async () => {
                    if (!detailReceipt?.id || !editingCategoryItemId) return;
                    setUpdateItemLoading(true);
                    try {
                      await updateReceiptItem(detailReceipt.id, editingCategoryItemId, { category: cat }, authToken);
                      setDetailReceipt((prev) =>
                        prev
                          ? {
                              ...prev,
                              items:
                                prev.items?.map((it) =>
                                  it.id === editingCategoryItemId ? { ...it, category: cat } : it
                                ) ?? [],
                            }
                          : null
                      );
                      setEditingCategoryItemId(null);
                    } catch (e) {
                      Alert.alert("Error", e instanceof Error ? e.message : "Could not update");
                    } finally {
                      setUpdateItemLoading(false);
                    }
                  }}
                  disabled={updateItemLoading}
                >
                  <Text style={[styles.splitGroupName, { color: textPrimary }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={addToMedicalModal && !!detailReceipt} transparent animationType="fade">
        <View style={styles.splitModalOverlay}>
          <View style={[styles.splitModalCard, { backgroundColor: glass }]}>
            <View style={styles.splitModalHeader}>
              <Text style={[styles.splitModalTitle, { color: textPrimary, flex: 1 }]}>Add to medical</Text>
              <TouchableOpacity onPress={() => setAddToMedicalModal(false)} hitSlop={12}>
                <X size={24} color={textPrimary} />
              </TouchableOpacity>
            </View>
            {medicalFolders.length === 0 ? (
              <Text style={[styles.splitModalEmpty, { color: textSecondary }]}>
                Create a patient folder first (Medical tab in Profile).
              </Text>
            ) : (
              <>
                <Text style={[styles.splitModalLabel, { color: textSecondary }]}>Patient folder</Text>
                <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={false}>
                  {medicalFolders.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.splitGroupRow,
                        { backgroundColor: selectedMedicalFolderId === f.id ? (isDarkMode ? "rgba(0,122,255,0.2)" : "rgba(0,122,255,0.15)") : bg },
                      ]}
                      onPress={() => setSelectedMedicalFolderId(f.id)}
                    >
                      <Text style={[styles.splitGroupName, { color: textPrimary }]}>{f.patientName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={[styles.splitModalLabel, { color: textSecondary }]}>Items to add</Text>
                {detailReceipt?.items && medicalSuggestions?.allItemIds && medicalSuggestions.allItemIds.length > 0 ? (
                  <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                    {detailReceipt.items
                      .filter((it) => it.id && medicalSuggestions!.allItemIds.includes(it.id))
                      .map((it) => (
                        <TouchableOpacity
                          key={it.id}
                          style={[styles.medicalItemRow, { backgroundColor: bg }]}
                          onPress={() => {
                            if (!it.id) return;
                            setSelectedMedicalItemIds((prev) =>
                              prev.includes(it.id!)
                                ? prev.filter((id) => id !== it.id)
                                : [...prev, it.id!]
                            );
                          }}
                        >
                          {selectedMedicalItemIds.includes(it.id!) ? (
                            <Check size={20} color={IOS_BLUE} />
                          ) : (
                            <Circle size={20} color={textSecondary} />
                          )}
                          <Text style={[styles.medicalItemName, { color: textPrimary }]} numberOfLines={1}>
                            {it.name ?? it.rawName ?? "Item"}
                          </Text>
                          <Text style={[styles.medicalItemPrice, { color: textSecondary }]}>
                            ${typeof it.totalPrice === "number" ? it.totalPrice.toFixed(2) : "0.00"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                ) : (
                  <Text style={[styles.splitModalHint, { color: textSecondary }]}>
                    {medicalSuggestions?.rxItemIds?.length ? "Prescription-like items pre-selected." : "All items will be added."}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.splitConfirmBtn, { backgroundColor: IOS_BLUE }]}
                  disabled={!selectedMedicalFolderId || addToMedicalLoading}
                  onPress={async () => {
                    if (!detailReceipt?.id || !selectedMedicalFolderId) return;
                    setAddToMedicalLoading(true);
                    try {
                      const result = await addReceiptToMedical(
                        detailReceipt.id,
                        selectedMedicalFolderId,
                        selectedMedicalItemIds.length > 0 ? selectedMedicalItemIds : medicalSuggestions?.allItemIds ?? [],
                        authToken
                      );
                      Alert.alert("Done", `Added ${result.addedCount} item(s) to ${result.patientName}.`);
                      setAddToMedicalModal(false);
                      setDetailReceipt(null);
                    } catch (e) {
                      Alert.alert("Error", e instanceof Error ? e.message : "Failed to add");
                    } finally {
                      setAddToMedicalLoading(false);
                    }
                  }}
                >
                  {addToMedicalLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.splitConfirmBtnText}>Add to folder</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!splitModalReceipt} transparent animationType="fade">
        <View style={styles.splitModalOverlay}>
          <View style={[styles.splitModalCard, { backgroundColor: glass }]}>
            <View style={styles.splitModalHeader}>
              {selectedGroup ? (
                <TouchableOpacity onPress={() => { setSelectedGroup(null); setGroupMembers([]); }} hitSlop={12}>
                  <ArrowLeft size={24} color={textPrimary} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
              <Text style={[styles.splitModalTitle, { color: textPrimary, flex: 1, textAlign: "center" }]}>
                {selectedGroup ? `Split with ${selectedGroup.name}` : "Split with Group"}
              </Text>
              <TouchableOpacity onPress={() => { setSplitModalReceipt(null); setSelectedGroup(null); setGroupMembers([]); }} hitSlop={12}>
                <X size={24} color={textPrimary} />
              </TouchableOpacity>
            </View>
            {splitModalReceipt && (
              <>
                <Text style={[styles.splitModalReceiptLabel, { color: textSecondary }]}>
                  Receipt: {splitModalReceipt.store?.name ?? "Store"} · ${Number(splitModalReceipt.total).toFixed(2)}
                </Text>
                {!selectedGroup ? (
                  <>
                    {groups.length === 0 ? (
                      <Text style={[styles.splitModalEmpty, { color: textSecondary }]}>No groups yet. Create one in the Scan tab.</Text>
                    ) : (
                      groups.map((g) => (
                        <TouchableOpacity
                          key={g.id}
                          style={[styles.splitGroupRow, { backgroundColor: bg }]}
                          onPress={() => onSelectGroupForSplit(g)}
                          disabled={membersLoading}
                          activeOpacity={0.8}
                        >
                          {membersLoading ? (
                            <ActivityIndicator size="small" color={IOS_BLUE} style={{ alignSelf: "center" }} />
                          ) : (
                            <Text style={[styles.splitGroupName, { color: textPrimary }]}>{g.name}</Text>
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                    <TouchableOpacity
                      style={styles.splitClearBtn}
                      onPress={() => {
                        setReceiptGroup(splitModalReceipt.id, null, authToken)
                          .then(() => {
                            triggerDashboardRefresh();
                            setSplitModalReceipt(null);
                          })
                          .catch(() => Alert.alert("Could not clear", "Please try again."));
                      }}
                    >
                      <Text style={styles.splitClearBtnText}>Clear group</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {membersLoading ? (
                      <ActivityIndicator size="small" color={IOS_BLUE} style={{ marginVertical: 16 }} />
                    ) : (
                      <>
                        <Text style={[styles.splitModalLabel, { color: textSecondary }]}>Split with</Text>
                        <View style={styles.splitModeRow}>
                          <TouchableOpacity
                            style={[styles.splitModeBtn, receiptSplitMode === "all" && { backgroundColor: IOS_BLUE }]}
                            onPress={() => { setReceiptSplitMode("all"); setReceiptSelectedIds(participantIdsFromMembers); }}
                          >
                            <Text style={[styles.splitModeBtnText, { color: receiptSplitMode === "all" ? "#FFF" : textPrimary }]}>All members</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.splitModeBtn, receiptSplitMode === "selected" && { backgroundColor: IOS_BLUE }]}
                            onPress={() => setReceiptSplitMode("selected")}
                          >
                            <Text style={[styles.splitModeBtnText, { color: receiptSplitMode === "selected" ? "#FFF" : textPrimary }]}>Selected</Text>
                          </TouchableOpacity>
                        </View>
                        {receiptSplitMode === "selected" && (
                          <View style={styles.receiptMemberSection}>
                            <TouchableOpacity onPress={() => setReceiptSelectedIds(participantIdsFromMembers)} style={{ marginBottom: 8 }}>
                              <Text style={{ fontSize: 14, color: IOS_BLUE, fontWeight: "600" }}>Select all</Text>
                            </TouchableOpacity>
                            {groupMembers.map((m) => {
                              const uid = (m as { userId?: string }).userId ?? (m as { id?: string }).id;
                              const name = m.name?.trim() || (m as { email?: string }).email || "Member";
                              const selected = uid && receiptSelectedIds.includes(uid);
                              return (
                                <TouchableOpacity
                                  key={uid ?? name}
                                  style={[styles.receiptMemberRow, { backgroundColor: selected ? (isDarkMode ? "rgba(0,122,255,0.2)" : "rgba(0,122,255,0.15)") : bg }]}
                                  onPress={() => {
                                    if (!uid) return;
                                    if (selected) {
                                      if (receiptSelectedIds.length <= 1) return;
                                      setReceiptSelectedIds(receiptSelectedIds.filter((id) => id !== uid));
                                    } else {
                                      setReceiptSelectedIds([...receiptSelectedIds, uid]);
                                    }
                                  }}
                                >
                                  {selected ? <Check size={18} color={IOS_BLUE} /> : <Circle size={18} color={textSecondary} />}
                                  <Text style={[styles.receiptMemberName, { color: textPrimary }]} numberOfLines={1}>{name}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                        <Text style={[styles.splitModalHint, { color: textSecondary }]}>
                          {receiptSplitMode === "all"
                            ? `Split equally among all ${participantIdsFromMembers.length} members`
                            : `Split equally among ${receiptSelectedIds.length} selected member${receiptSelectedIds.length !== 1 ? "s" : ""}`}
                        </Text>
                        <TouchableOpacity
                          style={[styles.splitConfirmBtn, { backgroundColor: IOS_BLUE }]}
                          onPress={async () => {
                            if (!selectedGroup) return;
                            const ids = receiptSplitMode === "all" ? undefined : receiptSelectedIds;
                            if (receiptSplitMode === "selected" && (!ids || ids.length === 0)) {
                              Alert.alert("Select at least one member", "Choose who to split with.");
                              return;
                            }
                            setShareLoading(selectedGroup.id);
                            try {
                              const result = await shareReceiptToGroup(splitModalReceipt.id, selectedGroup.id, authToken, ids);
                              if (result.alreadyShared) {
                                Alert.alert("Already shared", "This receipt was already shared to this group.");
                              } else {
                                Alert.alert("Receipt added to group", receiptSplitMode === "selected" && ids ? `Split among ${ids.length} selected members.` : undefined);
                              }
                              triggerDashboardRefresh();
                              setSplitModalReceipt(null);
                              setSelectedGroup(null);
                              setGroupMembers([]);
                            } catch (e) {
                              Alert.alert("Could not split receipt", "Could not split this receipt with the group. Please try again.");
                            } finally {
                              setShareLoading(null);
                            }
                          }}
                          disabled={!!shareLoading}
                        >
                          {shareLoading === selectedGroup?.id ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text style={styles.splitConfirmBtnText}>Split receipt</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
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
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: "800" },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  searchBtn: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16 },
  scroll: { flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    width: "47%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  cardTappable: { paddingHorizontal: 10, paddingTop: 0, paddingBottom: 4 },
  imageWrap: { width: "100%", aspectRatio: 1, position: "relative" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  placeholderStore: { fontSize: 13, textAlign: "center", marginBottom: 4 },
  placeholderTotal: { fontSize: 18, fontWeight: "700" },
  needsReviewBadge: { backgroundColor: "rgba(255,149,0,0.25)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
  needsReviewText: { fontSize: 11, fontWeight: "600", color: "#CC7A00" },
  trashBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardFooter: { paddingHorizontal: 10, paddingTop: 8 },
  storeNameRow: { flexDirection: "row", alignItems: "center", marginRight: 6 },
  storeName: { fontSize: 14, fontWeight: "600", flex: 1 },
  splitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  splitBtnText: { fontSize: 13, fontWeight: "600", color: IOS_BLUE },
  amount: { fontSize: 15, fontWeight: "700", color: IOS_BLUE, paddingHorizontal: 10, paddingBottom: 10 },
  sectionHeaderWrap: { marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
  sectionHeaderTitle: { fontSize: 18, fontWeight: "700" },
  sectionHeaderSub: { fontSize: 13, marginTop: 2 },
  uploadedBy: { fontSize: 12, paddingHorizontal: 10, paddingBottom: 10 },
  splitModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  splitModalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  splitModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  splitModalTitle: { fontSize: 20, fontWeight: "700" },
  splitModalReceiptLabel: { fontSize: 14, marginBottom: 12 },
  splitModalEmpty: { fontSize: 14, marginBottom: 16 },
  splitModalLabel: { fontSize: 14, marginBottom: 8 },
  splitModeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  splitModeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,122,255,0.5)" },
  splitModeBtnText: { fontSize: 15, fontWeight: "600" },
  receiptMemberSection: { maxHeight: 160, marginBottom: 12 },
  receiptMemberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6 },
  receiptMemberName: { fontSize: 15, flex: 1 },
  splitModalHint: { fontSize: 12, marginBottom: 14 },
  splitConfirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  splitConfirmBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  splitGroupRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  splitGroupName: { fontSize: 16, fontWeight: "600" },
  splitClearBtn: { marginTop: 16, alignItems: "center" },
  splitClearBtnText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
  detailModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  detailModalCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  detailModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  detailModalTitle: { fontSize: 20, fontWeight: "700", flex: 1 },
  detailModalScroll: { maxHeight: 520 },
  detailImageSection: {
    width: "100%",
    minHeight: 260,
    maxHeight: 320,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailImageFull: {
    width: "100%",
    height: 280,
    borderRadius: 0,
  },
  detailImagePlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    margin: 16,
  },
  detailImagePlaceholderText: { fontSize: 16, marginBottom: 4 },
  detailImagePlaceholderSub: { fontSize: 14 },
  detailDataSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  detailDataSectionTitle: { fontSize: 12, fontWeight: "600", marginBottom: 12, letterSpacing: 0.5 },
  detailMeta: { marginBottom: 16 },
  detailUploadedBy: { fontSize: 13, marginBottom: 8 },
  detailDate: { fontSize: 14, marginBottom: 2 },
  detailDateHint: { fontSize: 11, opacity: 0.8 },
  detailTotal: { fontSize: 22, fontWeight: "800" },
  dateEditInput: { borderRadius: 10, padding: 14, fontSize: 16 },
  detailItems: { marginTop: 8 },
  detailItemsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  detailItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  detailItemName: { fontSize: 15, flex: 1, marginRight: 12 },
  detailItemPrice: { fontSize: 15, fontWeight: "600" },
  categoryChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryChipText: { fontSize: 12 },
  subcategoryText: { fontSize: 11, flex: 1 },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  approveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  addToMedicalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1.5,
  },
  addToMedicalBtnText: { fontSize: 16, fontWeight: "600" },
  medicalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    gap: 10,
  },
  medicalItemName: { flex: 1, fontSize: 14 },
  medicalItemPrice: { fontSize: 14 },
});
