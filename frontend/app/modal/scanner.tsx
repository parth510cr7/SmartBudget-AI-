import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { X, ImageUp } from "lucide-react-native";
import {
  postReceiptFromBase64,
  postReceiptFromLocal,
  postReceiptFromProcessText,
  getMyHousehold,
  getReceiptOverpaidInsight,
  type ReceiptVisibilityType,
} from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getRawTextFromImageWithMeta } from "../../src/utils/ocr";
import { parseReceiptText } from "../../src/utils/localParser";
import { getCategoryForStore } from "../../src/utils/localCategorizer";
import { runOnDevicePipeline } from "../../src/services/receiptParsePipeline";

/** Keep enough resolution for OCR; avoid aggressive resize/compression that blurs text. Higher res helps Vision return full receipt. */
const MAX_WIDTH = 1600;
const QUALITY = 0.78;
const IOS_BLUE = "#007AFF";
const FROSTED_BG = "rgba(0, 0, 0, 0.8)";

const LOADING_PHRASES = [
  "Recording data...",
  "Noting in the books...",
  "Organizing your wealth...",
  "Categorizing magic...",
];

/** Short-OCR safety: below this we never trust local OCR – always use cloud (and send image with process-text for backend fallback). */
const OCR_MIN_CHARS = 150;
const OCR_MIN_LINES = 5;

const OCR_LOG_PREFIX = "[ReceiptScan]";

async function attachOverpaidInsight(authToken: string | null, res: unknown) {
  const id =
    typeof res === "object" && res && "id" in res && typeof (res as { id: unknown }).id === "string"
      ? (res as { id: string }).id
      : null;
  if (!id) return;
  try {
    const insight = await getReceiptOverpaidInsight(authToken, id);
    useStore.getState().setLastReceiptInsight(insight);
  } catch {
    /* non-fatal */
  }
}

function getImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
  });
}

function getRandomLoadingPhrase() {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}

export default function ScannerModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<"idle" | "captured" | "uploading">("idle");
  const [processingStatus, setProcessingStatus] = useState<"on-device" | "cloud" | null>(null);
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [household, setHousehold] = useState<{ id: string; name: string } | null>(null);
  const [saveTarget, setSaveTarget] = useState<ReceiptVisibilityType>("personal");
  const cameraRef = useRef<CameraView>(null);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
  }, [cameraPermission]);

  useEffect(() => {
    if (mediaLibraryPermission?.status !== "granted") {
      MediaLibrary.requestPermissionsAsync().catch(() => {});
    }
  }, [mediaLibraryPermission]);

  useEffect(() => {
    getMyHousehold(authToken ?? null)
      .then((r) => {
        const h = r.household;
        if (h?.id) {
          setHousehold({ id: h.id, name: h.name });
        } else {
          setHousehold(null);
          setSaveTarget("personal");
        }
      })
      .catch(() => {
        setHousehold(null);
        setSaveTarget("personal");
      });
  }, [authToken]);

  useEffect(() => {
    if (status === "uploading") setLoadingPhrase(getRandomLoadingPhrase());
  }, [status]);

  const galleryOpenedRef = useRef(false);
  useEffect(() => {
    if (params.source === "gallery" && !galleryOpenedRef.current) {
      galleryOpenedRef.current = true;
      const t = setTimeout(() => {
        pickFromGallery();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [params.source]);

  async function processImageUri(uri: string): Promise<string | null> {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_WIDTH } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return manipulated.base64 ?? null;
    } catch {
      return null;
    }
  }

  async function saveToCameraRoll(imageUri: string) {
    try {
      const mediaPerm = await MediaLibrary.requestPermissionsAsync();
      if (mediaPerm.status === "granted") {
        await MediaLibrary.saveToLibraryAsync(imageUri);
      }
    } catch (e) {
      if (__DEV__) console.warn("MediaLibrary save failed", e);
    }
  }

  /** Get locally verified store/total/date from image when on-device OCR is available. */
  async function getLocalExtractFromImage(base64: string): Promise<{ storeName: string; total: number; date?: string } | null> {
    try {
      const meta = await getRawTextFromImageWithMeta(base64);
      const rawText = meta.text;
      if (!rawText) return null;
      const parsed = parseReceiptText(rawText);
      if (parsed.locallyVerified && parsed.storeName != null && parsed.total != null)
        return { storeName: parsed.storeName, total: parsed.total, date: parsed.date ?? undefined };
    } catch (e) {
      if (__DEV__) console.warn("Local OCR/parse skipped", e);
    }
    return null;
  }

  /** When OCR returns null or is suspiciously short, we use Cloud. processingStatus shows "On-Device Brain" vs "Cloud Backup". */
  async function uploadBase64(base64: string, imageUri?: string) {
    setStatus("uploading");
    if (imageUri) saveToCameraRoll(imageUri);
    try {
      let ocrBlockCount = 0;
      let ocrLineCount = 0;
      let ocrCharCount = 0;
      let rawText: string | null = null;
      if (imageUri && __DEV__) {
        const dims = await getImageDimensions(imageUri);
        if (dims) console.log(`${OCR_LOG_PREFIX} original image dimensions: ${dims.width}x${dims.height}`);
        console.log(`${OCR_LOG_PREFIX} preprocessed: maxWidth=${MAX_WIDTH} quality=${QUALITY}`);
      }
      try {
        const meta = await getRawTextFromImageWithMeta(base64);
        rawText = meta.text;
        ocrBlockCount = meta.blockCount;
        ocrLineCount = meta.lineCount;
        ocrCharCount = meta.charCount;
        if (__DEV__) {
          console.log(
            `${OCR_LOG_PREFIX} OCR blocks=${ocrBlockCount} lines=${ocrLineCount} chars=${ocrCharCount} | tooShort=${ocrLineCount < OCR_MIN_LINES || ocrCharCount < OCR_MIN_CHARS}`
          );
          console.log(`${OCR_LOG_PREFIX} final text passed to parser: ${(rawText ?? "").length} chars, preview: ${(rawText ?? "").slice(0, 120)}${(rawText?.length ?? 0) > 120 ? "..." : ""}`);
        }
      } catch (_) {
        rawText = null;
      }
      const tooShort =
        !rawText ||
        rawText.trim().length < OCR_MIN_CHARS ||
        ocrLineCount < OCR_MIN_LINES;
      if (__DEV__ && tooShort && rawText) {
        console.warn(`${OCR_LOG_PREFIX} Short-OCR: local result not trusted (lines=${ocrLineCount} chars=${ocrCharCount}). Cloud fallback triggered.`);
      }
      if (rawText && rawText.trim().length > 0 && !tooShort) {
        setProcessingStatus("on-device");
        const pipelineResult = await runOnDevicePipeline(rawText);
        if (pipelineResult?.confident) {
          // IMPORTANT: saving via /from-local currently stores only a placeholder line item.
          // To keep basket matching + finalize working, we must persist real line items.
          // Use /process-text with raw OCR + image so backend can extract items (cloud fallback if needed).
          const res = await postReceiptFromProcessText(
            authToken,
            rawText,
            base64,
            { visibilityType: saveTarget, householdId: saveTarget === "household" ? household?.id : undefined }
          ) as { id?: string; store?: { name?: string }; total?: number; needsReview?: boolean };
          const desc = (res?.store?.name ?? pipelineResult.storeName).trim() || "Receipt";
          const amt = typeof res?.total === "number" && res.total > 0 ? res.total : pipelineResult.total;
          if (amt > 0) useStore.getState().setExpensePrefill({ description: desc, amount: amt, needsReview: res?.needsReview });
          useStore.getState().triggerDashboardRefresh();
          await attachOverpaidInsight(authToken, res);
          router.back();
          return;
        }
        try {
          const res = await postReceiptFromProcessText(
            authToken,
            rawText,
            base64,
            { visibilityType: saveTarget, householdId: saveTarget === "household" ? household?.id : undefined }
          ) as { id?: string; store?: { name?: string }; total?: number; needsReview?: boolean };
          const desc = res?.store?.name?.trim() || "Receipt";
          const amt = typeof res?.total === "number" && res.total > 0 ? res.total : 0;
          if (amt > 0) useStore.getState().setExpensePrefill({ description: desc, amount: amt, needsReview: res?.needsReview });
          useStore.getState().triggerDashboardRefresh();
          await attachOverpaidInsight(authToken, res);
          router.back();
          return;
        } catch (_) {
          /* engine failed; use same raw text for local parser fallback */
        }
        const parsed = parseReceiptText(rawText);
        if (parsed.locallyVerified && parsed.storeName != null && parsed.total != null) {
          // Same reasoning as above: use /process-text so item lines exist for basket matching.
          const res = await postReceiptFromProcessText(
            authToken,
            rawText,
            base64,
            { visibilityType: saveTarget, householdId: saveTarget === "household" ? household?.id : undefined }
          ) as { id?: string; store?: { name?: string }; total?: number; needsReview?: boolean };
          const desc = (res?.store?.name ?? parsed.storeName).trim() || "Receipt";
          const amt = typeof res?.total === "number" && res.total > 0 ? res.total : parsed.total;
          if (amt > 0) useStore.getState().setExpensePrefill({ description: desc, amount: amt, needsReview: res?.needsReview });
          useStore.getState().triggerDashboardRefresh();
          await attachOverpaidInsight(authToken, res);
          router.back();
          return;
        }
      }
      if (__DEV__) console.log(`${OCR_LOG_PREFIX} cloud fallback triggered: yes`);
      setProcessingStatus("cloud");
      const res = await postReceiptFromBase64(
        base64,
        authToken,
        imageUri ?? null,
        null,
        null,
        { visibilityType: saveTarget, householdId: saveTarget === "household" ? household?.id : undefined }
      ) as { id?: string; store?: { name?: string }; total?: number; needsReview?: boolean };
      const desc = res?.store?.name?.trim() || "Receipt";
      const amt = typeof res?.total === "number" && res.total > 0 ? res.total : 0;
      if (amt > 0) useStore.getState().setExpensePrefill({ description: desc, amount: amt, needsReview: (res as { needsReview?: boolean })?.needsReview });
      useStore.getState().triggerDashboardRefresh();
      await attachOverpaidInsight(authToken, res);
      router.back();
    } catch (e) {
      if (__DEV__) console.warn("Receipt API error", e);
      const msg = e instanceof Error ? e.message : "Upload failed";
      const isAbort = msg.includes("abort") || msg.includes("AbortError");
      const isNetwork = isAbort || /cannot reach|cannot connect|network|failed to fetch|load failed|cleartext|unable to resolve/i.test(msg);
      setToastMessage(
        isAbort
          ? "Request timed out. Try a smaller receipt or check the server."
          : isNetwork
            ? "Can't reach server. Use the same Wi‑Fi as your computer and ensure the backend is running (npm run dev in backend folder)."
            : msg
      );
      router.back();
    } finally {
      setProcessingStatus(null);
    }
  }

  async function captureAndSend() {
    if (!cameraRef.current || !cameraPermission?.granted) return;
    setProcessing(true);
    setStatus("captured");
    try {
      const cam = cameraRef.current as unknown as { takePictureAsync: (o: object) => Promise<{ uri?: string }> };
      const photo = await cam.takePictureAsync({
        quality: 0.6,
        base64: false,
        skipProcessing: true,
      });
      if (!photo?.uri) {
        setProcessing(false);
        setStatus("idle");
        return;
      }
      saveToCameraRoll(photo.uri);

      const base64 = await processImageUri(photo.uri);
      if (!base64) {
        setToastMessage("Could not prepare image");
        setProcessing(false);
        setStatus("idle");
        return;
      }

      await uploadBase64(base64, photo.uri);
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProcessing(false);
      setStatus("idle");
    }
  }

  async function pickFromGallery() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("You've refused to allow this app to access your photos!");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const assets = result.assets;
    setProcessing(true);
    setStatus("captured");
    setUploadProgress({ current: 0, total: assets.length });
    try {
      setStatus("uploading");
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        if (!asset?.uri) continue;
        setUploadProgress({ current: i + 1, total: assets.length });
        saveToCameraRoll(asset.uri);
        const base64 = await processImageUri(asset.uri);
        if (!base64) {
          setToastMessage(`Receipt ${i + 1}: Could not prepare image`);
          setProcessing(false);
          setStatus("idle");
          return;
        }
        let done = false;
        let rawText: string | null = null;
        try {
          const meta = await getRawTextFromImageWithMeta(base64);
          rawText = meta.text;
          if (__DEV__) {
            console.log(`${OCR_LOG_PREFIX} [gallery ${i + 1}] OCR blocks=${meta.blockCount} lines=${meta.lineCount} chars=${meta.charCount}`);
          }
        } catch (_) {
          rawText = null;
        }
        const lineCount = rawText ? rawText.trim().split(/\r?\n/).filter((l) => l.trim()).length : 0;
        const charCount = rawText ? rawText.length : 0;
        const tooShort = !rawText || charCount < OCR_MIN_CHARS || lineCount < OCR_MIN_LINES;
        if (rawText?.trim() && !tooShort) {
          setProcessingStatus("on-device");
          const pipelineResult = await runOnDevicePipeline(rawText);
          if (pipelineResult?.confident) {
            const saved = await postReceiptFromProcessText(authToken, rawText, base64, {
              visibilityType: saveTarget,
              householdId: saveTarget === "household" ? household?.id : undefined,
            });
            useStore.getState().triggerDashboardRefresh();
            await attachOverpaidInsight(authToken, saved);
            done = true;
          }
          if (!done) {
            try {
              const saved = await postReceiptFromProcessText(authToken, rawText, base64, {
                visibilityType: saveTarget,
                householdId: saveTarget === "household" ? household?.id : undefined,
              });
              useStore.getState().triggerDashboardRefresh();
              await attachOverpaidInsight(authToken, saved);
              done = true;
            } catch (_) {}
          }
          if (!done) {
            const parsed = parseReceiptText(rawText);
            if (parsed.locallyVerified && parsed.storeName != null && parsed.total != null) {
              const saved = await postReceiptFromProcessText(authToken, rawText, base64, {
                visibilityType: saveTarget,
                householdId: saveTarget === "household" ? household?.id : undefined,
              });
              useStore.getState().triggerDashboardRefresh();
              await attachOverpaidInsight(authToken, saved);
              done = true;
            }
          }
        }
        try {
          if (!done) {
            setProcessingStatus("cloud");
            const localExtract = await getLocalExtractFromImage(base64);
            if (localExtract) {
              const category = getCategoryForStore(localExtract.storeName);
              const saved = await postReceiptFromLocal(authToken, {
                storeName: localExtract.storeName,
                total: localExtract.total,
                date: localExtract.date,
                category,
                visibilityType: saveTarget,
                householdId: saveTarget === "household" ? household?.id : undefined,
                image: base64 ?? undefined,
              });
              useStore.getState().triggerDashboardRefresh();
              await attachOverpaidInsight(authToken, saved);
            } else {
              const saved = await postReceiptFromBase64(base64, authToken, asset.uri, null, null, {
                visibilityType: saveTarget,
                householdId: saveTarget === "household" ? household?.id : undefined,
              });
              useStore.getState().triggerDashboardRefresh();
              await attachOverpaidInsight(authToken, saved);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          const isNetwork = /cannot reach|cannot connect|network|failed to fetch|load failed|cleartext|unable to resolve/i.test(message);
          setToastMessage(
            isNetwork
              ? "Can't reach server. Use same Wi‑Fi as your computer and ensure the backend is running."
              : `Receipt ${i + 1} failed: ${message}`
          );
          setProcessing(false);
          setStatus("idle");
          return;
        }
      }
      setToastMessage(`Processed ${assets.length} receipt(s).`);
      router.back();
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProcessing(false);
      setStatus("idle");
    }
  }

  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera access...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission is required to scan receipts.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestCameraPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  }

  if (processing && status === "uploading") {
    const showToast = toastMessage ? (
      <View style={styles.toast}>
        <Text style={styles.toastText} numberOfLines={2}>{toastMessage}</Text>
      </View>
    ) : null;
    const progressText =
      uploadProgress.total > 1
        ? `Processing receipt ${uploadProgress.current} of ${uploadProgress.total}...`
        : loadingPhrase;
    const statusLabel =
      processingStatus === "on-device"
        ? "On-Device Brain"
        : processingStatus === "cloud"
          ? "Cloud Backup"
          : null;
    return (
      <View style={[styles.container, styles.frostedOverlay]}>
        {showToast}
        <ActivityIndicator size="large" color={IOS_BLUE} />
        <Text style={styles.loadingText}>{progressText}</Text>
        {statusLabel ? (
          <Text style={styles.processingStatusText}>{statusLabel}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            setProcessing(false);
            setStatus("idle");
          }}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      {toastMessage ? (
        <View style={styles.toast}>
          <Text style={styles.toastText} numberOfLines={2}>{toastMessage}</Text>
        </View>
      ) : null}
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <X size={28} color="#FFF" />
      </TouchableOpacity>
      {household ? (
        <View style={styles.saveTargetPill}>
          <TouchableOpacity
            style={[styles.saveTargetChip, saveTarget === "personal" && styles.saveTargetChipActive]}
            onPress={() => setSaveTarget("personal")}
            disabled={processing}
            activeOpacity={0.85}
          >
            <Text style={[styles.saveTargetText, saveTarget === "personal" && styles.saveTargetTextActive]}>Personal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveTargetChip, saveTarget === "household" && styles.saveTargetChipActive]}
            onPress={() => setSaveTarget("household")}
            disabled={processing}
            activeOpacity={0.85}
          >
            <Text style={[styles.saveTargetText, saveTarget === "household" && styles.saveTargetTextActive]}>Household</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.galleryBtn}
          onPress={pickFromGallery}
          disabled={processing}
        >
          <ImageUp size={24} color="#FFF" />
          <Text style={styles.galleryBtnText}>Upload from Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={captureAndSend}
          disabled={processing}
        >
          <Text style={styles.captureBtnText}>{processing ? "..." : "Scan"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  frostedOverlay: {
    backgroundColor: FROSTED_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "#FFF", fontSize: 16, textAlign: "center", padding: 24 },
  loadingText: { color: "rgba(255,255,255,0.9)", fontSize: 18, marginTop: 16 },
  processingStatusText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: IOS_BLUE,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  btnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: FROSTED_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  saveTargetPill: {
    position: "absolute",
    top: 52,
    left: 16,
    flexDirection: "row",
    backgroundColor: FROSTED_BG,
    borderRadius: 999,
    padding: 4,
    gap: 6,
  },
  saveTargetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveTargetChipActive: {
    backgroundColor: IOS_BLUE,
  },
  saveTargetText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" },
  saveTargetTextActive: { color: "#FFF" },
  bottomBar: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
  },
  galleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: IOS_BLUE,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  galleryBtnText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  captureBtn: {
    backgroundColor: IOS_BLUE,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  captureBtnText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  cancelBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24 },
  cancelBtnText: { color: "rgba(255,255,255,0.9)", fontSize: 16 },
  toast: {
    position: "absolute",
    top: 56,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    zIndex: 10,
  },
  toastText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});
