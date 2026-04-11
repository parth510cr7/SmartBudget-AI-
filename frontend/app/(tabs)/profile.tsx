import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { User, LogOut, Trash2, MapPin, ChevronDown, ChevronRight } from "lucide-react-native";
import { postDemoSeed, purgeAllData, healthCheck, getApiBase, seedTestGroup } from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, IOS_RED, SPACING, RADIUS, LIQUID } from "../../src/theme";
import { clearLocalData } from "../../src/lib/localDb";
import {
  loadLocationConsent,
  saveLocationConsent,
  revokeLocationAccess,
  getLocationPermissionStatus,
} from "../../src/lib/locationConsent";
import {
  isLLMAvailable,
  isLLMReady,
  initOnDeviceLLM,
} from "../../src/services/onDeviceLLM";
import {
  isModelDownloaded,
  downloadPhiModel,
  getModelFileUri,
  getModelPath,
  getModelInfo,
  deletePhiModel,
} from "../../src/services/phiModelDownload";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

function isImageUri(s: string): boolean {
  return s.startsWith("http") || s.startsWith("data:") || s.startsWith("file:");
}

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [devSectionExpanded, setDevSectionExpanded] = useState(false);
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [modelInfo, setModelInfo] = useState<{ path: string; exists: boolean; sizeBytes: number } | null>(null);
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);
  const [storageDiag, setStorageDiag] = useState<{ platform: string; docDir: string | null; cacheDir: string | null } | null>(null);
  const user = useStore((s) => s.user);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const locationConsent = useStore((s) => s.locationConsent);
  const setLocationConsent = useStore((s) => s.setLocationConsent);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const isLoggedIn = !!user && !(user as { isGuest?: boolean }).isGuest;
  const displayName = (user as { displayName?: string | null } | null)?.displayName ?? null;
  const userName = (user as { name?: string | null } | null)?.name ?? null;
  const userEmail = (user as { email?: string | null } | null)?.email ?? null;
  const avatarUrl = (user as { avatarUrl?: string | null } | null)?.avatarUrl ?? null;
  const headerName = displayName?.trim() || userName?.trim() || "User";

  useFocusEffect(
    useCallback(() => {
      loadLocationConsent().then(setLocationConsent);
      getLocationPermissionStatus().then(setLocationStatus);
      isModelDownloaded().then(setModelDownloaded);
      getModelInfo().then(setModelInfo).catch(() => setModelInfo(null));
      setLlmReady(isLLMReady());
      const fs = FileSystem as unknown as { documentDirectory?: string | null; cacheDirectory?: string | null };
      setStorageDiag({
        platform: Platform.OS,
        docDir: fs.documentDirectory ?? null,
        cacheDir: fs.cacheDirectory ?? null,
      });
    }, [setLocationConsent])
  );

  const nearbyEnabled = locationConsent?.nearbyCommunityEnabled ?? true;
  const handleNearbyToggle = useCallback(
    async (value: boolean) => {
      const next = {
        ...(locationConsent ?? { consentStatus: "not_asked" as const, usePreciseLocation: false, nearbyCommunityEnabled: true }),
        nearbyCommunityEnabled: value,
      };
      if (value && (next.consentStatus === "declined_in_app" || next.consentStatus === "os_denied")) {
        next.consentStatus = "not_asked";
        await saveLocationConsent({ nearbyCommunityEnabled: true, consentStatus: "not_asked" });
      } else {
        await saveLocationConsent({ nearbyCommunityEnabled: value });
      }
      setLocationConsent(next);
    },
    [locationConsent, setLocationConsent]
  );

  const handleDisableLocationPricing = useCallback(() => {
    Alert.alert(
      "Disable location for pricing",
      "This will turn off nearby community pricing. You can turn it back on anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: async () => {
            const next = await revokeLocationAccess();
            setLocationConsent(next);
            getLocationPermissionStatus().then(setLocationStatus);
          },
        },
      ]
    );
  }, [setLocationConsent]);

  async function loadDemoData() {
    setLoading(true);
    try {
      const result = await postDemoSeed(authToken);
      useStore.getState().triggerDashboardRefresh();
      Alert.alert("Done", `Loaded ${result.receipts ?? 0} receipts and ${result.stores ?? 0} stores.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load demo data";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedTestGroup() {
    setSeeding(true);
    try {
      const { groupId } = await seedTestGroup(authToken ?? "dev-token");
      useStore.getState().triggerDashboardRefresh();
      router.push(`/group/${groupId}`);
    } catch (e) {
      Alert.alert("Seed Failed", e instanceof Error ? e.message : "Could not create test group");
    } finally {
      setSeeding(false);
    }
  }

  function handleReset() {
    Alert.alert(
      "Reset App Data",
      "This will permanently delete all your receipts and transaction data. You cannot undo this.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            Promise.all([clearLocalData(), purgeAllData(authToken)])
              .then(() => {
                useStore.getState().setTransactions([]);
                useStore.getState().setBasket([]);
                useStore.getState().setLastReceiptInsight(null);
                useStore.getState().triggerDashboardRefresh();
              })
              .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Reset failed"));
          },
        },
      ]
    );
  }

  function handleLogOut() {
    useStore.getState().setUser(null);
  }

  async function handleCheckConnection() {
    setCheckingConnection(true);
    try {
      const data = await healthCheck();
      Alert.alert(
        "Connection OK",
        `Backend at ${getApiBase()} responded: ${data.status}\n${data.timestamp ? `(${data.timestamp})` : ""}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      Alert.alert(
        "Connection failed",
        `${msg}\n\nMake sure the backend is running and EXPO_PUBLIC_API_URL in .env points to it.`
      );
    } finally {
      setCheckingConnection(false);
    }
  }

  const llmAvailable = isLLMAvailable();

  async function handleDownloadPhiModel() {
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress(0);
    try {
      await downloadPhiModel((p) => setDownloadProgress(p));
      setModelDownloaded(true);
      getModelInfo().then(setModelInfo).catch(() => setModelInfo(null));
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }

  async function handleLoadPhiModel() {
    setLoadingModel(true);
    setDownloadError(null);
    setLastLoadError(null);
    try {
      const info = await getModelInfo().catch(() => null);
      setModelInfo(info);
      const okDownloaded = await isModelDownloaded();
      if (!okDownloaded) {
        const sizeMb = info ? (info.sizeBytes / (1024 * 1024)).toFixed(0) : "0";
        setDownloadError(`Model file missing or incomplete (size ${sizeMb} MB). Re-download and try again.`);
        return;
      }
      const uri = getModelFileUri();
      const ok = await initOnDeviceLLM(uri, (p) => setDownloadProgress(p));
      setLlmReady(ok);
      if (!ok) setDownloadError("Failed to load model");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Load failed";
      setDownloadError(msg);
      setLastLoadError(msg);
    } finally {
      setLoadingModel(false);
    }
  }

  const locationStatusLine =
    locationConsent?.consentStatus === "granted_precise" || locationConsent?.consentStatus === "granted_approximate"
      ? `Location: allowed (${locationConsent.consentStatus === "granted_precise" ? "precise" : "approximate"})`
      : locationConsent?.consentStatus === "os_denied"
        ? "Location: denied"
        : locationConsent?.consentStatus === "declined_in_app"
          ? "Location: not used"
          : locationStatus === "granted"
            ? "Location: enable below for nearby prices"
            : "Location: not requested";

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.headerTitle, { color: textPrimary }]}>Profile</Text>

      {/* Section 1 — Account */}
      {isLoggedIn ? (
        <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.userCard]}>
          <View style={[styles.avatarWrap, { backgroundColor: bg }]}>
            {avatarUrl && isImageUri(avatarUrl) ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <User size={48} color={IOS_BLUE} />
            )}
          </View>
          <Text style={[styles.userName, { color: textPrimary }]}>{headerName}</Text>
          {userEmail ? (
            <Text style={[styles.userEmail, { color: textSecondary }]}>{userEmail}</Text>
          ) : null}
          <TouchableOpacity style={styles.logOutBtn} onPress={handleLogOut} activeOpacity={0.85}>
            <LogOut size={18} color={IOS_RED} />
            <Text style={styles.logOutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </GlassSurface>
      ) : (
        <>
          <Text style={[styles.welcomeSubtitle, { color: textSecondary }]}>
            Sign in to sync your data across devices.
          </Text>
          <View style={styles.authSection}>
            <TouchableOpacity
              style={styles.appleBtn}
              onPress={() => router.push("/modal/login")}
              activeOpacity={0.85}
            >
              <Text style={styles.appleBtnText}>Sign in with Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/modal/login")} activeOpacity={0.85}>
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.button} style={LIQUID.shadow}>
                <View style={styles.googleBtnInner}>
                  <Text style={[styles.googleBtnText, { color: textPrimary }]}>Sign in with Google</Text>
                </View>
              </GlassSurface>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Privacy & Location */}
      <Text style={[styles.sectionLabel, { color: textSecondary }]}>Privacy & Location</Text>
      <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.privacyCard]}>
        <View style={styles.privacyRow}>
          <MapPin size={20} color={IOS_BLUE} />
          <Text style={[styles.privacyTitle, { color: textPrimary }]}>Location access</Text>
        </View>
        <Text style={[styles.privacyStatus, { color: textSecondary }]}>{locationStatusLine}</Text>
        <View style={styles.privacyToggleRow}>
          <Text style={[styles.privacyToggleLabel, { color: textPrimary }]}>Use location for nearby community pricing</Text>
          <Switch
            value={nearbyEnabled}
            onValueChange={handleNearbyToggle}
            trackColor={{ false: bg, true: IOS_BLUE }}
            thumbColor="#FFF"
          />
        </View>
        <Text style={[styles.privacyHint, { color: textSecondary }]}>
          Used for local price insights within ~30 km. Address never shared.
        </Text>
        <TouchableOpacity
          style={[styles.privacyDisableBtn, { borderColor: textSecondary }]}
          onPress={handleDisableLocationPricing}
          activeOpacity={0.8}
        >
          <Text style={[styles.privacyDisableText, { color: textSecondary }]}>Disable location for pricing</Text>
        </TouchableOpacity>
      </GlassSurface>

      {/* Section 4 — Data */}
      <Text style={[styles.sectionLabel, { color: textSecondary }]}>Data</Text>
      <TouchableOpacity onPress={() => router.push("/modal/price-history-sharing")} activeOpacity={0.85}>
        <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.privacyCard]}>
          <Text style={[styles.privacyTitle, { color: textPrimary }]}>Share my price history</Text>
          <Text style={[styles.privacyHint, { color: textSecondary }]}>
            Share receipt-based prices with another user (by their user ID). They see your prices when finalizing a basket.
          </Text>
        </GlassSurface>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dataResetBtn, { borderColor: "rgba(255, 59, 48, 0.4)" }]}
        onPress={handleReset}
        activeOpacity={0.85}
      >
        <Trash2 size={18} color={IOS_RED} />
        <Text style={[styles.dataResetText, { color: IOS_RED }]}>Reset app data</Text>
      </TouchableOpacity>

      {/* On-device AI — Phi 3.5 mini */}
      <Text style={[styles.sectionLabel, { color: textSecondary }]}>On-device AI</Text>
      <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.privacyCard]}>
        <Text style={[styles.privacyTitle, { color: textPrimary }]}>Phi 3.5 mini</Text>
        <Text style={[styles.privacyHint, { color: textSecondary }]}>
          Parse receipts on-device with no cloud. Download once (~1.4 GB), then load. Requires a development build.
        </Text>
        {storageDiag ? (
          <Text style={[styles.hint, { color: textSecondary }]}>
            Storage: {storageDiag.platform} · docDir {storageDiag.docDir ? "ok" : "null"} · cacheDir {storageDiag.cacheDir ? "ok" : "null"}
          </Text>
        ) : null}
        {modelInfo ? (
          <Text style={[styles.hint, { color: textSecondary }]}>
            Model: {modelInfo.exists ? "found" : "missing"} · {(modelInfo.sizeBytes / (1024 * 1024)).toFixed(0)} MB
          </Text>
        ) : null}
        {!llmAvailable ? (
          <Text style={[styles.privacyHint, { color: textSecondary }]}>
            Not available in Expo Go. Build with: npx expo run:ios or EAS Build.
          </Text>
        ) : llmReady ? (
          <Text style={[styles.privacyStatus, { color: IOS_BLUE, fontWeight: "600" }]}>Ready — receipts use on-device LLM when possible.</Text>
        ) : modelDownloaded || modelInfo?.exists ? (
          <>
            <TouchableOpacity
              style={[styles.demoBtn, { backgroundColor: IOS_BLUE }]}
              onPress={handleLoadPhiModel}
              disabled={loadingModel}
            >
              {loadingModel ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.demoBtnText}>Load model</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dataResetBtn, { borderColor: "rgba(255, 59, 48, 0.35)", marginBottom: 6 }]}
              onPress={async () => {
                Alert.alert("Delete model", "Remove the downloaded model file from this device? You can re-download it after.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deletePhiModel();
                      setModelDownloaded(false);
                      setLlmReady(false);
                      setDownloadError(null);
                      setLastLoadError(null);
                      getModelInfo().then(setModelInfo).catch(() => setModelInfo(null));
                    },
                  },
                ]);
              }}
              activeOpacity={0.85}
            >
              <Trash2 size={18} color={IOS_RED} />
              <Text style={[styles.dataResetText, { color: IOS_RED }]}>Delete model file</Text>
            </TouchableOpacity>
            {downloadError ? <Text style={[styles.hint, { color: IOS_RED }]}>{downloadError}</Text> : null}
            {lastLoadError ? <Text style={[styles.hint, { color: IOS_RED }]}>{`Load error: ${lastLoadError}`}</Text> : null}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.demoBtn, { backgroundColor: IOS_BLUE }]}
              onPress={handleDownloadPhiModel}
              disabled={downloading}
            >
              {downloading ? (
                <View style={styles.demoBtnInner}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.demoBtnText}>{Math.round(downloadProgress * 100)}%</Text>
                </View>
              ) : (
                <Text style={styles.demoBtnText}>Download Phi 3.5 mini (~1.4 GB)</Text>
              )}
            </TouchableOpacity>
            {downloadError ? <Text style={[styles.hint, { color: IOS_RED }]}>{downloadError}</Text> : null}
          </>
        )}
      </GlassSurface>

      {/* Section 5 — Developer / Testing (only in __DEV__) */}
      {__DEV__ && (
        <>
          <TouchableOpacity
            style={styles.devSectionHeader}
            onPress={() => setDevSectionExpanded((e) => !e)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>Developer</Text>
            {devSectionExpanded ? (
              <ChevronDown size={18} color={textSecondary} />
            ) : (
              <ChevronRight size={18} color={textSecondary} />
            )}
          </TouchableOpacity>
          {devSectionExpanded && (
            <View style={styles.devSection}>
              <TouchableOpacity
                style={[styles.demoBtn, { backgroundColor: IOS_BLUE }]}
                onPress={handleCheckConnection}
                disabled={checkingConnection}
              >
                {checkingConnection ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.demoBtnText}>Check connection</Text>
                )}
              </TouchableOpacity>
              <Text style={[styles.hint, { color: textSecondary }]}>GET /health</Text>
              <TouchableOpacity
                style={[styles.demoBtn, { backgroundColor: IOS_BLUE }]}
                onPress={loadDemoData}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.demoBtnText}>Load demo data</Text>
                )}
              </TouchableOpacity>
              <Text style={[styles.hint, { color: textSecondary }]}>Seed sample receipts</Text>
              <TouchableOpacity
                style={[styles.demoBtn, { backgroundColor: "#FF9500" }]}
                onPress={handleSeedTestGroup}
                disabled={seeding}
              >
                {seeding ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.demoBtnText}>Create test group</Text>
                )}
              </TouchableOpacity>
              <Text style={[styles.hint, { color: textSecondary }]}>Creates populated group and opens it</Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: SPACING.pageHorizontal, paddingTop: 56, paddingBottom: 48 },
  headerTitle: { fontSize: 28, fontWeight: "800", marginBottom: 24, letterSpacing: -0.5 },
  welcomeSubtitle: { fontSize: 16, marginBottom: 20 },
  userCard: {
    padding: 24,
    alignItems: "center",
    marginBottom: SPACING.sectionGap,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 48 },
  userName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  userEmail: { fontSize: 14, marginBottom: 12 },
  logOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  logOutBtnText: { fontSize: 15, fontWeight: "600", color: IOS_RED },
  authSection: { gap: 12, marginBottom: SPACING.sectionGap },
  appleBtn: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    borderRadius: RADIUS.button,
    alignItems: "center",
  },
  appleBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  googleBtnInner: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  googleBtnText: { fontSize: 16, fontWeight: "600" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  privacyCard: {
    padding: SPACING.cardPadding,
    marginBottom: SPACING.sectionGap,
  },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  privacyTitle: { fontSize: 16, fontWeight: "600" },
  privacyStatus: { fontSize: 14, marginBottom: 12 },
  privacyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  privacyToggleLabel: { fontSize: 14, flex: 1, marginRight: 12 },
  privacyHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  privacyDisableBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    alignItems: "center",
  },
  privacyDisableText: { fontSize: 14 },
  dataResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    marginBottom: SPACING.sectionGap,
  },
  dataResetText: { fontSize: 15, fontWeight: "600" },
  devSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  devSection: { marginBottom: SPACING.sectionGap },
  demoBtn: {
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
    marginBottom: 4,
  },
  demoBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  demoBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  hint: { fontSize: 12, marginBottom: 12 },
});
