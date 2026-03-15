import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { FileText, Pill, Plus, ChevronRight, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMedicalFolders,
  getMedicalFolder,
  createMedicalFolder,
  deleteMedicalFolder,
  addMedicalRecord,
  addMedicalExpense,
  type MedicalFolderRow,
  type MedicalFolderDetail,
} from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";

const INDIGO = "#4F46E5";
const PURPLE = "#7C3AED";

export default function MedicalScreen() {
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);

  const [folders, setFolders] = useState<MedicalFolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<MedicalFolderDetail | null>(null);
  const [folderIdOpen, setFolderIdOpen] = useState<string | null>(null);
  const [addFolderVisible, setAddFolderVisible] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [addFolderSubmitting, setAddFolderSubmitting] = useState(false);
  const [addRecordVisible, setAddRecordVisible] = useState(false);
  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [recordTitle, setRecordTitle] = useState("");
  const [recordType, setRecordType] = useState("Note");
  const [recordNotes, setRecordNotes] = useState("");
  const [expenseItemName, setExpenseItemName] = useState("");
  const [expensePrice, setExpensePrice] = useState("");
  const [expenseStoreName, setExpenseStoreName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadFolders = useCallback(async () => {
    const token = authToken || "dev-token";
    setLoading(true);
    setError(null);
    try {
      const list = await getMedicalFolders(token);
      setFolders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const loadFolderDetail = useCallback(
    async (folderId: string) => {
      const token = authToken || "dev-token";
      try {
        const detail = await getMedicalFolder(token, folderId);
        setSelectedFolder(detail);
        setFolderIdOpen(folderId);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to load folder");
      }
    },
    [authToken]
  );

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleAddFolder = async () => {
    const name = newPatientName.trim();
    if (!name) return;
    setAddFolderSubmitting(true);
    try {
      await createMedicalFolder(authToken || "dev-token", name);
      setNewPatientName("");
      setAddFolderVisible(false);
      await loadFolders();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setAddFolderSubmitting(false);
    }
  };

  const handleDeleteFolder = (folder: MedicalFolderRow) => {
    Alert.alert(
      "Delete folder?",
      `"${folder.patientName}" and all records/expenses will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMedicalFolder(authToken || "dev-token", folder.id);
              if (folderIdOpen === folder.id) {
                setSelectedFolder(null);
                setFolderIdOpen(null);
              }
              await loadFolders();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const handleAddRecord = async () => {
    const title = recordTitle.trim();
    if (!title || !folderIdOpen) return;
    setSubmitting(true);
    try {
      await addMedicalRecord(authToken || "dev-token", folderIdOpen, {
        type: recordType,
        title,
        notes: recordNotes.trim() || null,
      });
      setRecordTitle("");
      setRecordType("Note");
      setRecordNotes("");
      setAddRecordVisible(false);
      await loadFolderDetail(folderIdOpen);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to add record");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExpense = async () => {
    const itemName = expenseItemName.trim();
    const price = Number(expensePrice);
    if (!itemName || !Number.isFinite(price) || price < 0 || !folderIdOpen) return;
    setSubmitting(true);
    try {
      await addMedicalExpense(authToken || "dev-token", folderIdOpen, {
        itemName,
        price,
        storeName: expenseStoreName.trim() || null,
      });
      setExpenseItemName("");
      setExpensePrice("");
      setExpenseStoreName("");
      setAddExpenseVisible(false);
      await loadFolderDetail(folderIdOpen);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textPrimary }]}>Medical Vault</Text>
        <Text style={[styles.subtitle, { color: textSecondary }]}>Health records & expenses by patient</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={IOS_BLUE} style={{ marginTop: 24 }} />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: textSecondary }]}>{error}</Text>
          <TouchableOpacity onPress={() => loadFolders()} style={styles.retryBtn}>
            <Text style={{ color: IOS_BLUE, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.addFolderBtn, { backgroundColor: isDarkMode ? "rgba(79,70,229,0.3)" : "#EEF2FF" }]}
            onPress={() => setAddFolderVisible(true)}
          >
            <Plus size={22} color={INDIGO} />
            <Text style={[styles.addFolderBtnText, { color: INDIGO }]}>Add patient folder</Text>
          </TouchableOpacity>

          {folders.length === 0 ? (
            <Text style={[styles.empty, { color: textSecondary }]}>No patient folders yet. Tap "Add patient folder" to create one.</Text>
          ) : (
            folders.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.folder, { backgroundColor: isDarkMode ? "rgba(255,255,255,0.06)" : "#FFFFFF", borderColor: folderIdOpen === f.id ? INDIGO : "transparent" }]}
                onPress={() => loadFolderDetail(f.id)}
                onLongPress={() => handleDeleteFolder(f)}
              >
                <View style={[styles.folderIconWrap, { backgroundColor: isDarkMode ? "rgba(79,70,229,0.25)" : "#EEF2FF" }]}>
                  <FileText size={40} color={INDIGO} />
                </View>
                <View style={styles.folderTextWrap}>
                  <Text style={[styles.folderTitle, { color: textPrimary }]}>{f.patientName}</Text>
                  <Text style={[styles.folderSub, { color: textSecondary }]}>
                    {f.recordsCount} records · {f.expensesCount} expenses
                  </Text>
                </View>
                <ChevronRight size={22} color={textSecondary} />
              </TouchableOpacity>
            ))
          )}

          {selectedFolder && folderIdOpen === selectedFolder.id && (
            <View style={[styles.detail, { backgroundColor: isDarkMode ? "rgba(255,255,255,0.06)" : "#FFFFFF" }]}>
              <Text style={[styles.detailTitle, { color: textPrimary }]}>{selectedFolder.patientName}</Text>
              <View style={styles.detailActions}>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: isDarkMode ? "rgba(79,70,229,0.3)" : "#EEF2FF" }]} onPress={() => setAddRecordVisible(true)}>
                  <FileText size={18} color={INDIGO} />
                  <Text style={[styles.detailActionText, { color: INDIGO }]}>Add record</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: isDarkMode ? "rgba(124,58,237,0.3)" : "#F5F3FF" }]} onPress={() => setAddExpenseVisible(true)}>
                  <Pill size={18} color={PURPLE} />
                  <Text style={[styles.detailActionText, { color: PURPLE }]}>Add expense</Text>
                </TouchableOpacity>
              </View>
              {selectedFolder.records.length === 0 && selectedFolder.expenses.length === 0 ? (
                <Text style={[styles.detailEmpty, { color: textSecondary }]}>No records or expenses yet.</Text>
              ) : (
                <>
                  {selectedFolder.records.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: textSecondary }]}>Records</Text>
                      {selectedFolder.records.map((r) => (
                        <View key={r.id} style={[styles.itemRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                          <Text style={[styles.itemTitle, { color: textPrimary }]}>{r.title}</Text>
                          <Text style={[styles.itemMeta, { color: textSecondary }]}>
                            {r.type} · {new Date(r.date).toLocaleDateString()}
                            {r.notes ? ` · ${r.notes}` : ""}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                  {selectedFolder.expenses.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: textSecondary }]}>Expenses</Text>
                      {selectedFolder.expenses.map((e) => (
                        <View key={e.id} style={[styles.itemRow, { borderBottomColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
                          <Text style={[styles.itemTitle, { color: textPrimary }]}>{e.itemName}</Text>
                          <Text style={[styles.itemMeta, { color: textSecondary }]}>
                            ${e.price.toFixed(2)} · {new Date(e.date).toLocaleDateString()}
                            {e.storeName ? ` · ${e.storeName}` : ""}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add folder modal */}
      <Modal visible={addFolderVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !addFolderSubmitting && setAddFolderVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>New patient folder</Text>
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Patient name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={newPatientName}
              onChangeText={setNewPatientName}
              placeholder="e.g. John Doe"
              placeholderTextColor={textSecondary}
              autoCapitalize="words"
            />
            <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: INDIGO }]} onPress={handleAddFolder} disabled={!newPatientName.trim() || addFolderSubmitting}>
              {addFolderSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSubmitText}>Create</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !addFolderSubmitting && setAddFolderVisible(false)}>
              <Text style={[styles.modalCancel, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add record modal */}
      <Modal visible={addRecordVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !submitting && setAddRecordVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Add record</Text>
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={recordTitle}
              onChangeText={setRecordTitle}
              placeholder="e.g. Annual checkup"
              placeholderTextColor={textSecondary}
            />
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Type</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={recordType}
              onChangeText={setRecordType}
              placeholder="Note, Visit, etc."
              placeholderTextColor={textSecondary}
            />
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={recordNotes}
              onChangeText={setRecordNotes}
              placeholder="Optional notes"
              placeholderTextColor={textSecondary}
              multiline
            />
            <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: INDIGO }]} onPress={handleAddRecord} disabled={!recordTitle.trim() || submitting}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSubmitText}>Add</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !submitting && setAddRecordVisible(false)}>
              <Text style={[styles.modalCancel, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add expense modal */}
      <Modal visible={addExpenseVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !submitting && setAddExpenseVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDarkMode ? "#1C1C1E" : "#FFFFFF" }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Add expense</Text>
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Item / description</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={expenseItemName}
              onChangeText={setExpenseItemName}
              placeholder="e.g. Prescription"
              placeholderTextColor={textSecondary}
            />
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Price</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={expensePrice}
              onChangeText={setExpensePrice}
              placeholder="0.00"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.modalLabel, { color: textSecondary }]}>Store (optional)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDarkMode ? "#2C2C2E" : "#F2F2F7", color: textPrimary }]}
              value={expenseStoreName}
              onChangeText={setExpenseStoreName}
              placeholder="Pharmacy or store name"
              placeholderTextColor={textSecondary}
            />
            <TouchableOpacity
              style={[styles.modalSubmit, { backgroundColor: PURPLE }]}
              onPress={handleAddExpense}
              disabled={!expenseItemName.trim() || !Number(expensePrice) || Number(expensePrice) < 0 || submitting}
            >
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalSubmitText}>Add</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !submitting && setAddExpenseVisible(false)}>
              <Text style={[styles.modalCancel, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 100 },
  addFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
  },
  addFolderBtnText: { fontSize: 16, fontWeight: "600" },
  empty: { paddingVertical: 24, fontSize: 15 },
  folder: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
  },
  folderIconWrap: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 16 },
  folderTextWrap: { flex: 1 },
  folderTitle: { fontSize: 18, fontWeight: "700" },
  folderSub: { fontSize: 14, marginTop: 4 },
  errorWrap: { padding: 24, alignItems: "center" },
  errorText: { textAlign: "center", marginBottom: 12 },
  retryBtn: { paddingVertical: 8 },
  detail: {
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  detailTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  detailActions: { flexDirection: "row", gap: 12, marginBottom: 16 },
  detailActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  detailActionText: { fontSize: 15, fontWeight: "600" },
  detailEmpty: { fontSize: 14 },
  sectionLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  itemRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemTitle: { fontSize: 16, fontWeight: "600" },
  itemMeta: { fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 340, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  modalLabel: { fontSize: 14, marginBottom: 6 },
  modalInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 16 },
  modalSubmit: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 8 },
  modalSubmitText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
});
