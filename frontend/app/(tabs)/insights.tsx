import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Search, Send, MapPin, Store, X, ListChecks, Trash2, Bookmark } from "lucide-react-native";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE, IOS_RED } from "../../src/theme";
import {
  getTransactions,
  getStores,
  getReceipts,
  appQuery,
  askSmartBudget,
  getBasketInsights,
  createSmartList,
  getSmartLists,
  type BasketInsightsResponse,
} from "../../src/api/client";
import { getLocalTransactions, saveLocalTransactions } from "../../src/lib/localDb";
import {
  loadLocationConsent,
  saveLocationConsent,
  getLocationForNearby,
  hasConsentedLocation,
} from "../../src/lib/locationConsent";
import { LocationConsentModal, type LocationConsentChoice } from "../../src/components/LocationConsentModal";
import { type SpendingGlassTileDatum } from "../../src/components/SpendingGlassTileBoard";
import { CategoryEmptyStateTiles } from "../../src/components/CategoryEmptyStateTiles";

type ReceiptItem = {
  name?: string;
  rawName?: string;
  unitPrice?: number;
  totalPrice?: number;
  quantity?: number;
  unit?: string;
  category?: string;
};
type ReceiptWithStore = {
  id: string;
  store?: { name?: string; address?: string | null };
  storeName?: string | null;
  rawStoreName?: string | null;
  canonicalStoreName?: string | null;
  date?: string;
  purchaseDate?: string;
  createdAt?: string;
  total?: number | string;
  amount?: number | string;
  grandTotal?: number | string;
  items?: ReceiptItem[];
};

/** Per-store price entry for comparison (unit price = price per unit of measure for fair comparison). */
type PriceEntry = { storeName: string; unitPrice: number; unit: string; totalPrice?: number; quantity?: number };

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase() || "—";
}

function compactStoreName(name: string, maxLen = 12): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Store";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(3, maxLen - 3)).trimEnd()}...`;
}

/** Open address in maps. Shows Apple Maps / Google Maps choice on iOS; on Android can default to Google. */
function openStoreInMaps(storeName: string, address: string) {
  const query = address.trim() || storeName.trim();
  if (!query) return;
  const encoded = encodeURIComponent(query);
  const appleMapsUrl = `https://maps.apple.com/?q=${encoded}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  if (Platform.OS === "ios") {
    Alert.alert("Navigate to store", `Open "${storeName}" in maps?`, [
      { text: "Apple Maps", onPress: () => Linking.openURL(appleMapsUrl).catch(() => Alert.alert("Error", "Could not open Apple Maps")) },
      { text: "Google Maps", onPress: () => Linking.openURL(googleMapsUrl).catch(() => Alert.alert("Error", "Could not open Google Maps")) },
      { text: "Cancel", style: "cancel" },
    ]);
  } else {
    Alert.alert("Navigate to store", `Open "${storeName}" in maps?`, [
      { text: "Google Maps", onPress: () => Linking.openURL(googleMapsUrl).catch(() => Alert.alert("Error", "Could not open Google Maps")) },
      { text: "Apple Maps", onPress: () => Linking.openURL(appleMapsUrl).catch(() => Alert.alert("Error", "Could not open Apple Maps")) },
      { text: "Cancel", style: "cancel" },
    ]);
  }
}

function toPositiveNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function getReceiptStoreName(r: ReceiptWithStore): string {
  const name = (
    r.store?.name ??
    r.canonicalStoreName ??
    r.storeName ??
    r.rawStoreName ??
    ""
  ).trim();
  return name;
}

function getReceiptDate(r: ReceiptWithStore): Date | null {
  const raw = r.purchaseDate ?? r.date ?? r.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getReceiptSpendTotal(r: ReceiptWithStore): number {
  const lineTotal = (r.items ?? []).reduce((sum, item) => {
    const quantity = toPositiveNumber(item.quantity) || 1;
    const totalFromRow = toPositiveNumber(item.totalPrice);
    const unitPrice = toPositiveNumber(item.unitPrice);
    const amount = totalFromRow > 0 ? totalFromRow : unitPrice > 0 ? unitPrice * quantity : 0;
    return amount > 0 ? sum + amount : sum;
  }, 0);
  if (lineTotal > 0) return lineTotal;
  const receiptTotal =
    toPositiveNumber(r.total) || toPositiveNumber(r.amount) || toPositiveNumber(r.grandTotal);
  return receiptTotal > 0 ? receiptTotal : 0;
}

function getItemDisplayName(item: ReceiptItem): string {
  const n = (item.name ?? item.rawName ?? "").trim();
  return n || "—";
}

/** Effective unit price: use unitPrice if > 0, else totalPrice/quantity. */
function getUnitPrice(item: ReceiptItem): number {
  const up = Number(item.unitPrice);
  if (up > 0) return up;
  const q = Number(item.quantity) || 1;
  const tot = Number(item.totalPrice);
  if (tot > 0 && q > 0) return tot / q;
  return 0;
}

/** Build from real receipts: item name -> list of { storeName, unitPrice, unit, totalPrice?, quantity? } for price-per-unit comparison. */
function buildItemPricesFromReceipts(receipts: ReceiptWithStore[]): Map<string, PriceEntry[]> {
  const map = new Map<string, PriceEntry[]>();
  for (const r of receipts) {
    const storeName = getReceiptStoreName(r) || "Unknown";
    for (const item of r.items ?? []) {
      const name = getItemDisplayName(item);
      const key = normalizeItemName(name);
      if (!key || key === "—") continue;
      const unitPrice = getUnitPrice(item);
      if (unitPrice <= 0) continue;
      const unit = (item.unit ?? "item").trim() || "item";
      const quantity = Number(item.quantity) || 1;
      const totalPrice = Number(item.totalPrice);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ storeName, unitPrice, unit, totalPrice, quantity });
    }
  }
  return map;
}

/** Fuzzy match: find all map keys that contain the query or that the query contains (e.g. "Milk" -> "whole milk", "milk 2%"). */
function getMatchingKeys(
  itemPricesMap: Map<string, PriceEntry[]>,
  normalizedQuery: string
): string[] {
  if (!normalizedQuery) return [];
  const keys: string[] = [];
  itemPricesMap.forEach((_, key) => {
    if (key.includes(normalizedQuery) || normalizedQuery.includes(key)) keys.push(key);
  });
  return keys;
}

/** For each item: best store (lowest unit price), unit for display, others, and subtext (paid X for Y unit). */
function buildBestPriceByItem(receipts: ReceiptWithStore[]): {
  displayName: string;
  unit: string;
  best: { storeName: string; unitPrice: number };
  others: { storeName: string; unitPrice: number }[];
  subtext?: string;
}[] {
  const itemPrices = buildItemPricesFromReceipts(receipts);
  const firstSeenName = new Map<string, string>();
  for (const r of receipts) {
    for (const item of r.items ?? []) {
      const name = getItemDisplayName(item);
      const key = normalizeItemName(name);
      if (key && key !== "—" && !firstSeenName.has(key)) firstSeenName.set(key, name || key);
    }
  }
  const result: {
    displayName: string;
    unit: string;
    best: { storeName: string; unitPrice: number };
    others: { storeName: string; unitPrice: number }[];
    subtext?: string;
  }[] = [];
  itemPrices.forEach((entries, key) => {
    const sorted = [...entries].sort((a, b) => a.unitPrice - b.unitPrice);
    const best = sorted[0];
    const others = sorted.slice(1).map((e) => ({ storeName: e.storeName, unitPrice: e.unitPrice }));
    const subtext =
      best.quantity != null && best.quantity > 0 && best.totalPrice != null && best.totalPrice > 0
        ? `Paid $${best.totalPrice.toFixed(2)} for ${best.quantity} ${best.unit}`
        : undefined;
    result.push({
      displayName: firstSeenName.get(key) ?? key,
      unit: best.unit,
      best: { storeName: best.storeName, unitPrice: best.unitPrice },
      others,
      subtext,
    });
  });
  result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return result;
}

function normalizeBasketItemName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Populate basket from recent receipt items (parsed data). Used automatically when basket is empty. */
async function loadBasketFromRecentReceipts(
  authToken: string | null,
  setBasketStore: (next: string[] | ((prev: string[]) => string[])) => void,
  setBasketInput: (s: string) => void
): Promise<void> {
  if (!authToken) return;
  try {
    const data = await getReceipts(authToken);
    const receipts = Array.isArray(data) ? data : [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const r of receipts.slice(0, 25)) {
      const items = (r as { items?: { name?: string; rawName?: string }[] }).items ?? [];
      for (const it of items) {
        const name = (it.name ?? it.rawName ?? "").trim();
        if (!name || name.length < 2) continue;
        const key = normalizeBasketItemName(name);
        if (key && key !== "item" && key !== "receipt" && !seen.has(key)) {
          seen.add(key);
          names.push(name);
        }
      }
    }
    if (names.length > 0) {
      setBasketStore(names);
      setBasketInput("");
    }
  } catch (_) {
    // Keep basket as-is on error
  }
}

export default function InsightsScreen() {
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);
  const transactions = useStore((s) => s.transactions ?? []) as ReceiptWithStore[];
  const setTransactionsStore = useStore((s) => s.setTransactions);
  const basket = useStore((s) => s.basket ?? []);
  const setBasketStore = useStore((s) => s.setBasket);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const [query, setQuery] = useState("");
  const [basketInput, setBasketInput] = useState("");
  const [askReply, setAskReply] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [showFinalized, setShowFinalized] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeFallback, setFinalizeFallback] = useState(false);
  const [showLocationConsentModal, setShowLocationConsentModal] = useState(false);
  const [basketInsights, setBasketInsights] = useState<BasketInsightsResponse | null>(null);
  const [topSpendCategories, setTopSpendCategories] = useState<{ name: string; amount: number }[]>([]);
  const [storeSummaries, setStoreSummaries] = useState<Array<{ name: string; totalSpent: number }>>([]);
  const [emptyStateLoading, setEmptyStateLoading] = useState(false);
  const emptyStateFetchIdRef = useRef(0);
  const [tileDetailDatum, setTileDetailDatum] = useState<SpendingGlassTileDatum | null>(null);
  const [saveBasketModal, setSaveBasketModal] = useState(false);
  const [saveBasketName, setSaveBasketName] = useState("");
  const [saveBasketLoading, setSaveBasketLoading] = useState(false);
  const [loadBasketModal, setLoadBasketModal] = useState(false);
  const [savedBaskets, setSavedBaskets] = useState<{ id: string; name: string; items: { name: string }[] }[]>([]);
  const [loadBasketLoading, setLoadBasketLoading] = useState(false);
  const locationConsent = useStore((s) => s.locationConsent);
  const setLocationConsent = useStore((s) => s.setLocationConsent);

  /** Load location consent from storage when Insights is focused (no request on launch). */
  useFocusEffect(
    useCallback(() => {
      loadLocationConsent().then(setLocationConsent);
    }, [setLocationConsent])
  );

  /** Local fallback: top categories from locally available transactions. */
  const localTopSpendCategories = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const r of transactions) {
      for (const item of r.items ?? []) {
        const category = (item.category ?? "Other").trim() || "Other";
        const quantity = Number(item.quantity) || 1;
        const totalFromRow = Number(item.totalPrice);
        const unitPrice = Number(item.unitPrice);
        const amount = totalFromRow > 0 ? totalFromRow : unitPrice > 0 ? unitPrice * quantity : 0;
        if (amount <= 0) continue;
        byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
      }
    }
    return [...byCategory.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions]);

  /** Local add-on: top stores by total spend for 2-3 extra empty-state bubbles. */
  const localTopSpendStores = useMemo(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const byStore = new Map<string, { totalAll: number; total30d: number; visits30d: number }>();

    for (const r of transactions) {
      const storeName = getReceiptStoreName(r);
      if (!storeName) continue;
      const receiptDate = getReceiptDate(r);
      const receiptSpend = getReceiptSpendTotal(r);
      if (receiptSpend <= 0) continue;

      const in30d = !receiptDate || receiptDate.getTime() >= cutoff;
      const prev = byStore.get(storeName) ?? { totalAll: 0, total30d: 0, visits30d: 0 };
      byStore.set(storeName, {
        totalAll: prev.totalAll + receiptSpend,
        total30d: prev.total30d + (in30d ? receiptSpend : 0),
        visits30d: prev.visits30d + (in30d ? 1 : 0),
      });
    }

    const localRanked = [...byStore.entries()]
      .map(([name, summary]) => ({
        name,
        totalAll: summary.totalAll,
        total30d: summary.total30d,
        avgDaily30d: summary.total30d / 30,
        visits30d: summary.visits30d,
      }))
      .sort((a, b) => b.totalAll - a.totalAll);

    const merged: Array<{ name: string; totalAll: number; total30d: number; avgDaily30d: number; visits30d: number }> = [];
    const seen = new Set<string>();

    for (const row of localRanked) {
      merged.push(row);
      seen.add(row.name.toLowerCase());
      if (merged.length >= 3) break;
    }

    if (merged.length < 3) {
      for (const row of storeSummaries) {
        const key = row.name.toLowerCase();
        if (!row.name || seen.has(key)) continue;
        merged.push({
          name: row.name,
          totalAll: row.totalSpent,
          total30d: row.totalSpent,
          avgDaily30d: row.totalSpent / 30,
          visits30d: 0,
        });
        seen.add(key);
        if (merged.length >= 3) break;
      }
    }

    return merged.slice(0, 3);
  }, [transactions, storeSummaries]);

  const emptyStateBubbleData = useMemo(() => {
    const categoryLimit = localTopSpendStores.length > 0 ? 4 : 5;
    const categoryBubbles = topSpendCategories.slice(0, categoryLimit).map((c) => ({
      category: c.name,
      amount: c.amount,
      kind: "category" as const,
      detailLine: "spent in this category",
    }));
    const topCategoryAmount = Math.max(...categoryBubbles.map((b) => b.amount), 1);
    const storeBubbles = localTopSpendStores.map((s) => ({
      category: compactStoreName(s.name, 12),
      amount: Math.min((s.total30d > 0 ? s.total30d : s.totalAll) * 0.55, topCategoryAmount * 0.7),
      kind: "store" as const,
      detailLine: `top store · ~30d total $${s.total30d.toFixed(2)} · avg/day $${s.avgDaily30d.toFixed(2)}`,
    }));
    return [...categoryBubbles, ...storeBubbles];
  }, [topSpendCategories, localTopSpendStores]);

  /** Fetch top spending categories for empty-state when basket is empty. Ignores stale responses via fetchId. */
  const fetchEmptyStateCategories = useCallback(() => {
    if (basket.length > 0) {
      setTopSpendCategories([]);
      return;
    }
    const fetchId = ++emptyStateFetchIdRef.current;
    setEmptyStateLoading(true);
    getBasketInsights(authToken ?? null, { itemNames: [] })
      .then((r) => {
        if (fetchId !== emptyStateFetchIdRef.current) return;
        const apiCats = Array.isArray(r.topSpendCategories) ? r.topSpendCategories : [];
        setTopSpendCategories(apiCats.length > 0 ? apiCats : localTopSpendCategories);
      })
      .catch(() => {
        if (fetchId !== emptyStateFetchIdRef.current) return;
        setTopSpendCategories(localTopSpendCategories);
      })
      .finally(() => {
        if (fetchId !== emptyStateFetchIdRef.current) return;
        setEmptyStateLoading(false);
      });
  }, [basket.length, authToken, localTopSpendCategories]);

  /** When basket is empty, clear finalized state and fetch empty-state data. When basket has items, clear categories. */
  useEffect(() => {
    if (basket.length === 0) {
      setShowFinalized(false);
      setBasketInsights(null);
      fetchEmptyStateCategories();
    } else {
      setTopSpendCategories([]);
    }
  }, [basket.length, fetchEmptyStateCategories]);

  /** When Insights tab is focused: if basket is empty, auto-fill from recent receipt items (parsed data); else refetch categories for empty-state bubbles. */
  useFocusEffect(
    useCallback(() => {
      if (basket.length === 0) {
        loadBasketFromRecentReceipts(authToken ?? null, setBasketStore, setBasketInput);
        fetchEmptyStateCategories();
      }
    }, [basket.length, authToken, setBasketStore, setBasketInput, fetchEmptyStateCategories])
  );

  /** If API returns empty but local data arrives later, promote local categories into empty-state bubbles. */
  useEffect(() => {
    if (basket.length === 0 && !emptyStateLoading && topSpendCategories.length === 0 && localTopSpendCategories.length > 0) {
      setTopSpendCategories(localTopSpendCategories);
    }
  }, [basket.length, emptyStateLoading, topSpendCategories.length, localTopSpendCategories]);

  const refetch = useCallback(() => {
    getLocalTransactions().then((local) => {
      setTransactionsStore(Array.isArray(local) ? local : []);
    });
    getStores(authToken ?? null)
      .then((rows) => {
        const safe = Array.isArray(rows)
          ? rows
              .map((r) => ({ name: (r.name ?? "").trim(), totalSpent: Number(r.totalSpent) || 0 }))
              .filter((r) => r.name && r.totalSpent > 0)
          : [];
        setStoreSummaries(safe);
      })
      .catch(() => {
        // Keep local-only fallback if stores endpoint is unavailable.
      });
    if (!authToken) {
      // Keep local transaction data for guest/empty-state category insights.
      return;
    }
    getTransactions(authToken)
      .then((txData) => {
        const list = Array.isArray(txData) ? txData : [];
        saveLocalTransactions(list);
        setTransactionsStore(list);
      })
      .catch(() => {
        // Keep existing store data so Basket/price matching still works if API fails
      });
  }, [authToken, setTransactionsStore]);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  useEffect(() => {
    refetch();
  }, [refetch, refreshKey]);

  useEffect(() => {
    setShowFinalized(false);
    setBasketInsights(null);
    setFinalizeFallback(false);
  }, [refreshKey]);

  /** Run finalize with optional location (only sent when user has consented). */
  const doFinalize = useCallback(
    async (coords: { lat: number; lng: number } | null) => {
      if (basket.length === 0) {
        setShowFinalized(true);
        setFinalizeFallback(true);
        setBasketInsights(null);
        return;
      }
      setFinalizeLoading(true);
      setBasketInsights(null);
      setFinalizeFallback(false);
      try {
        const payload = {
          itemNames: basket,
          lat: coords?.lat,
          lng: coords?.lng,
          locationAccuracy: coords ? "approximate" as const : null,
        };
        const insights = await getBasketInsights(authToken ?? null, payload);
        setBasketInsights(insights);
        setFinalizeFallback(false);
        setShowFinalized(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert("Could not load insights", message);
        setBasketInsights(null);
        setFinalizeFallback(true);
        setShowFinalized(true);
      } finally {
        setFinalizeLoading(false);
      }
    },
    [basket, authToken]
  );

  const handleFinalize = useCallback(async () => {
    if (basket.length === 0) {
      setShowFinalized(true);
      setFinalizeFallback(true);
      setBasketInsights(null);
      return;
    }
    let consent = locationConsent;
    if (!consent) {
      consent = await loadLocationConsent();
      setLocationConsent(consent);
    }
    if (consent.nearbyCommunityEnabled && consent.consentStatus === "not_asked") {
      setShowLocationConsentModal(true);
      return;
    }
    if (consent.consentStatus === "granted_precise" || consent.consentStatus === "granted_approximate") {
      const { coords, osGranted } = await getLocationForNearby(consent.usePreciseLocation);
      if (!osGranted) {
        await saveLocationConsent({ consentStatus: "os_denied" });
        setLocationConsent({
          ...(locationConsent ?? { consentStatus: "not_asked", usePreciseLocation: false, nearbyCommunityEnabled: true }),
          consentStatus: "os_denied",
        });
      }
      await doFinalize(coords);
    } else {
      await doFinalize(null);
    }
  }, [basket, locationConsent, doFinalize, setLocationConsent]);

  const handleLocationConsentChoice = useCallback(
    async (choice: LocationConsentChoice) => {
      setShowLocationConsentModal(false);
      const base = locationConsent ?? { consentStatus: "not_asked" as const, usePreciseLocation: false, nearbyCommunityEnabled: true };
      if (choice === "not_now") {
        await saveLocationConsent({ consentStatus: "declined_in_app" });
        setLocationConsent({ ...base, consentStatus: "declined_in_app" });
        await doFinalize(null);
        return;
      }
      const usePrecise = choice === "precise";
      const { coords, osGranted } = await getLocationForNearby(usePrecise);
      const newStatus: "granted_precise" | "granted_approximate" | "os_denied" = osGranted
        ? (usePrecise ? "granted_precise" : "granted_approximate")
        : "os_denied";
      await saveLocationConsent({ consentStatus: newStatus, usePreciseLocation: usePrecise });
      setLocationConsent({ ...base, consentStatus: newStatus, usePreciseLocation: usePrecise });
      await doFinalize(coords);
    },
    [doFinalize, locationConsent, setLocationConsent]
  );

  const itemPricesMap = useMemo(() => buildItemPricesFromReceipts(transactions), [transactions]);
  const bestPriceByItem = useMemo(() => buildBestPriceByItem(transactions), [transactions]);
  /** Your history filtered to basket items (for post-finalize section). */
  const yourHistoryForBasket = useMemo(() => {
    if (basket.length === 0) return [];
    const set = new Set(basket.map((b) => normalizeItemName(b)));
    return bestPriceByItem.filter((row) => {
      const key = normalizeItemName(row.displayName);
      return [...set].some((b) => key.includes(b) || b.includes(key));
    });
  }, [basket, bestPriceByItem]);

  const addToBasket = () => {
    const trimmed = basketInput.trim();
    if (trimmed && !basket.includes(trimmed)) {
      setBasketStore([...basket, trimmed]);
      setBasketInput("");
    }
  };

  const removeFromBasket = (item: string) => {
    setBasketStore(basket.filter((x) => x !== item));
  };

  const clearBasket = useCallback(() => {
    if (basket.length === 0) return;
    Alert.alert(
      "Clear basket",
      "Remove all items from your shopping list?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: () => setBasketStore([]) },
      ]
    );
  }, [basket.length, setBasketStore]);

  const handleAsk = useCallback(() => {
    const msg = query.trim();
    if (!msg || !authToken) return;
    setAskLoading(true);
    setAskReply(null);
    // First: real app-data query (spend by store/category, recent, cheapest store, group)
    appQuery(authToken, msg)
      .then((dataResult) => {
        const dataAnswer = dataResult.answer?.trim() ?? "";
        // Then: AI chat grounded in receipt context (backend builds context)
        return askSmartBudget(authToken, msg)
          .then((aiResult) => {
            const aiReply = aiResult.reply?.trim() ?? "";
            if (dataAnswer && aiReply && dataAnswer !== aiReply) {
              setAskReply(`From your data:\n\n${dataAnswer}\n\n——\n\nSmartBudget:\n\n${aiReply}`);
            } else if (dataAnswer) {
              setAskReply(dataAnswer);
            } else {
              setAskReply(aiReply || "Could not get an answer. Try again.");
            }
          })
          .catch(() => setAskReply(dataAnswer || "Could not get an answer. Try again."));
      })
      .catch(() => {
        askSmartBudget(authToken, msg)
          .then((r) => setAskReply(r.reply ?? "Could not get an answer. Try again."))
          .catch(() => setAskReply("Could not get an answer. Try again."));
      })
      .finally(() => setAskLoading(false));
  }, [query, authToken]);

  const hasLocation = hasConsentedLocation(locationConsent ?? null);

  return (
    <>
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      {/* Ask SmartBudget AI */}
      <View style={[styles.searchCard, { backgroundColor: glass, borderColor: "rgba(255,255,255,0.5)" }]}>
        <Search size={22} color={textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: textPrimary }]}
          placeholder="Ask SmartBudget about your spending"
          placeholderTextColor={textSecondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleAsk}
          editable={!askLoading}
        />
        <TouchableOpacity
          onPress={askLoading ? undefined : handleAsk}
          style={styles.sendBtn}
          activeOpacity={0.8}
          disabled={askLoading}
        >
          {askLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={20} color="#FFF" />}
        </TouchableOpacity>
      </View>
      {askReply !== null && (
        <View style={[styles.replyCard, { backgroundColor: glass }]}>
          <Text style={[styles.replyText, { color: textPrimary }]}>{askReply}</Text>
        </View>
      )}

      {/* Zone 2 — Basket */}
      <Text style={[styles.sectionTitle, { color: textPrimary }]}>Your basket</Text>
      <Text style={[styles.sectionSubtext, { color: textSecondary }]}>
        Add items (e.g. milk, eggs) and tap Finalize to get a recommended store and estimated total from your receipt history. Save basket to reuse later.
      </Text>
      {basket.length === 0 && (
        <View style={[styles.tipCard, { backgroundColor: glass }]}>
          <Text style={[styles.tipText, { color: textSecondary }]}>
            Tip: Scan 2–3 receipts first, then add items and tap Finalize to get store recommendations and price estimates.
          </Text>
        </View>
      )}
      <View style={[styles.basketCard, { backgroundColor: glass }]}>
        <View style={styles.basketInputRow}>
          <TextInput
            style={[styles.basketInput, { color: textPrimary, backgroundColor: bg }]}
            placeholder="e.g. Milk, Eggs"
            placeholderTextColor={textSecondary}
            value={basketInput}
            onChangeText={setBasketInput}
            onSubmitEditing={addToBasket}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBasketBtn} onPress={addToBasket} activeOpacity={0.8}>
            <Text style={styles.addBasketBtnText}>Add</Text>
          </TouchableOpacity>
          {basket.length > 0 && (
            <TouchableOpacity
              style={[styles.clearBasketBtn, { borderColor: IOS_RED }]}
              onPress={clearBasket}
              activeOpacity={0.8}
            >
              <Trash2 size={20} color={IOS_RED} />
            </TouchableOpacity>
          )}
        </View>
        {basket.length > 0 && (
          <>
            <View style={styles.chipRow}>
              {basket.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, { backgroundColor: bg }]}
                  onPress={() => removeFromBasket(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, { color: textPrimary }]}>{item}</Text>
                  <X size={14} color={textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.finalizeRow}>
              <TouchableOpacity
                style={[styles.finalizeBtn, { backgroundColor: IOS_BLUE, flex: 1 }]}
                onPress={finalizeLoading ? undefined : handleFinalize}
                disabled={finalizeLoading}
                activeOpacity={0.8}
              >
                {finalizeLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <ListChecks size={18} color="#FFF" />
                    <Text style={styles.finalizeBtnText}>Finalize</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBasketBtn, { backgroundColor: bg, borderColor: textSecondary }]}
                onPress={() => { setSaveBasketName(""); setSaveBasketModal(true); }}
                activeOpacity={0.8}
              >
                <Bookmark size={18} color={IOS_BLUE} />
                <Text style={[styles.saveBasketBtnText, { color: textPrimary }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBasketBtn, { backgroundColor: bg, borderColor: textSecondary }]}
                onPress={async () => {
                  setLoadBasketModal(true);
                  setLoadBasketLoading(true);
                  try {
                    const lists = await getSmartLists(authToken ?? null);
                    setSavedBaskets(lists.map((l) => ({ id: l.id, name: l.name, items: l.items ?? [] })));
                  } catch {
                    setSavedBaskets([]);
                  } finally {
                    setLoadBasketLoading(false);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.saveBasketBtnText, { color: textPrimary }]}>Load</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {showFinalized && basket.length > 0 && (
          <TouchableOpacity
            style={[styles.recommendedCard, { backgroundColor: bg }]}
            onPress={() => {
              if (basketInsights?.bestStore?.enabled) {
                const name = basketInsights.bestStore.storeName ?? "Store";
                const address = basketInsights.bestStore.storeAddress ?? basketInsights.bestStore.storeArea ?? "";
                if (address.trim() || name.trim()) openStoreInMaps(name, address);
              }
            }}
            activeOpacity={basketInsights?.bestStore?.enabled ? 0.7 : 1}
            disabled={!basketInsights?.bestStore?.enabled}
            accessibilityRole={basketInsights?.bestStore?.enabled ? "button" : undefined}
            accessibilityLabel={
              basketInsights?.bestStore?.enabled
                ? `Recommended store: ${basketInsights.bestStore.storeName ?? "Store"}. Tap to open in Apple Maps or Google Maps.`
                : "Best total estimate"
            }
          >
            <Text style={[styles.recommendedLabel, { color: textSecondary }]}>
              {basketInsights?.bestStore?.enabled
                ? "Recommended store (from your receipt history)"
                : "Best total estimate"}
            </Text>
            <View style={styles.recommendedRow}>
              <Store size={22} color={IOS_BLUE} />
              <Text style={[styles.recommendedStoreName, { color: textPrimary }]} numberOfLines={1}>
                {basketInsights?.bestStore?.enabled
                  ? (basketInsights.bestStore.storeName ?? "—")
                  : (basketInsights?.bestStore?.whyNoRecommendation ?? basketInsights?.bestStore?.fallbackMessage ?? "Don't have best pick yet 🥶")}
              </Text>
            </View>
            {(basketInsights?.receiptCount != null || (basketInsights?.bestStore?.itemsMatchedCount != null && basketInsights?.bestStore?.itemsTotalCount != null)) && (
              <Text style={[styles.confidenceHint, { color: textSecondary }]}>
                {basketInsights?.receiptCount != null && `Based on ${basketInsights.receiptCount} receipt${basketInsights.receiptCount === 1 ? "" : "s"}. `}
                {basketInsights?.bestStore?.itemsMatchedCount != null && basketInsights?.bestStore?.itemsTotalCount != null &&
                  `We have prices for ${basketInsights.bestStore.itemsMatchedCount} of ${basketInsights.bestStore.itemsTotalCount} items.`}
              </Text>
            )}
            <Text style={[styles.recommendedTotal, { color: textPrimary }]}>
              Est. total (from known data): $
              {(basketInsights?.bestStore?.enabled
                ? (basketInsights?.estimatedTotalKnownData ?? 0)
                : (basketInsights?.estimatedTotalKnownData ?? 0)
              ).toFixed(2)}
            </Text>
            {basketInsights?.bestStore?.enabled && (basketInsights.bestStore?.storeAddress || basketInsights.bestStore?.storeArea) && (
              <View style={styles.recommendedAddressRow}>
                <MapPin size={16} color={textSecondary} />
                <Text style={[styles.recommendedAddress, { color: textSecondary }]} numberOfLines={2}>
                  {(basketInsights.bestStore.storeAddress ?? basketInsights.bestStore.storeArea ?? "—").trim() || "—"}
                </Text>
              </View>
            )}
            {basketInsights?.bestStore?.enabled && (
              <Text style={[styles.navigateHint, { color: IOS_BLUE }]}>Tap to open in Maps</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Zone 3 — Empty state: category tiles only when basket is empty (premium tiles, tap for detail) */}
      {basket.length === 0 && (
        <View style={[styles.emptyStateBlock, { backgroundColor: "transparent" }]}>
          <Text style={[styles.insightsTitle, { color: textPrimary }]}>Your spending by category</Text>
          <Text style={[styles.sectionSubtext, { color: textSecondary }]}>
            Add items above and finalize to get store recommendations.
          </Text>
          {emptyStateLoading ? (
            <View style={styles.bubbleRow}>
              <ActivityIndicator size="large" color={IOS_BLUE} style={{ marginVertical: 24 }} />
            </View>
          ) : emptyStateBubbleData.length > 0 ? (
            <CategoryEmptyStateTiles
              data={emptyStateBubbleData}
              isDarkMode={isDarkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              glass={glass}
              bg={bg}
              onTilePress={(datum) => setTileDetailDatum(datum)}
            />
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary, marginTop: 12 }]}>
              Scan receipts to see spending by category here.
            </Text>
          )}
        </View>
      )}

      {/* Smart Insights: only when basket has items and has been finalized */}
      {showFinalized && basket.length > 0 && (
        <View style={[styles.insightsBlock, { backgroundColor: glass }]}>
          <Text style={[styles.insightsTitle, { color: textPrimary }]}>Smart Insights</Text>
          <Text style={[styles.sectionHint, { color: textSecondary, marginBottom: 12 }]}>
            Data comes from your scanned receipts. Use short item names (e.g. milk, eggs) to match better.
          </Text>

          {/* 2. Your History */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>Your History</Text>
          {basketInsights?.yourHistory && basketInsights.yourHistory.length > 0 ? (
            basketInsights.yourHistory.slice(0, 50).map((row, idx) => (
              <View key={`yh-${row.itemName}-${idx}`} style={styles.insightRow}>
                <Text style={[styles.insightItem, { color: textPrimary }]}>
                  {row.matchedReceiptItemName ? `${row.itemName} → ${row.matchedReceiptItemName}` : row.itemName}
                </Text>
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  ${row.unitPrice.toFixed(2)} / {row.unit ?? "item"} at {row.storeName}
                </Text>
              </View>
            ))
          ) : yourHistoryForBasket.length === 0 ? (
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              No past prices for these items. Scan receipts with these products first, or try shorter names (e.g. milk, eggs, bread).
            </Text>
          ) : (
            yourHistoryForBasket.slice(0, 50).map((row, idx) => (
              <View key={`yh-${row.displayName}-${idx}`} style={styles.insightRow}>
                <Text style={[styles.insightItem, { color: textPrimary }]}>{row.displayName}</Text>
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  ${row.best.unitPrice.toFixed(2)} / {row.unit} at {row.best.storeName}
                </Text>
              </View>
            ))
          )}

          {/* 3. Family / Group Prices */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>Family / Group Prices</Text>
          {basketInsights?.groupPrices && basketInsights.groupPrices.length > 0 ? (
            basketInsights.groupPrices.slice(0, 30).map((row) => (
              <View key={row.id} style={styles.insightRow}>
                <Text style={[styles.insightItem, { color: textPrimary }]}>{row.canonicalItemName ?? row.rawItemName}</Text>
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  {(row.canonicalStoreName ?? row.rawStoreName ?? row.storeName) ?? "—"} · ${row.price.toFixed(2)}
                  {row.normalizedUnitPrice != null ? ` · $${row.normalizedUnitPrice.toFixed(2)}/unit` : ""}
                  {row.createdByUser?.name ? ` · by ${row.createdByUser.name}` : ""}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary }]}>No group data for this basket yet.</Text>
          )}

          {/* 4. Shared Friend Prices */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>Shared Friend Prices</Text>
          {basketInsights?.sharedFriendPrices && basketInsights.sharedFriendPrices.length > 0 ? (
            basketInsights.sharedFriendPrices.slice(0, 30).map((row) => (
              <View key={row.id} style={styles.insightRow}>
                <Text style={[styles.insightItem, { color: textPrimary }]}>{row.canonicalItemName ?? row.rawItemName}</Text>
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  {(row.canonicalStoreName ?? row.rawStoreName ?? row.storeName) ?? "—"} · ${row.price.toFixed(2)}
                  {row.createdByUser?.name ? ` · by ${row.createdByUser.name}` : ""}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary }]}>No shared friend data for this basket yet.</Text>
          )}

          {/* 5. Nearby Community Average — essentials only */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>Nearby Community Average</Text>
          <Text style={[styles.sectionHint, { color: textSecondary }]}>Everyday items only (groceries, household, health, etc.)</Text>
          {hasLocation ? (
            basketInsights?.nearbyCommunityAverage && basketInsights.nearbyCommunityAverage.length > 0 ? (
              basketInsights.nearbyCommunityAverage.slice(0, 30).map((row, idx) => (
                <View key={`nca-${row.canonicalItemName}-${idx}`} style={styles.insightRow}>
                  <Text style={[styles.insightItem, { color: textPrimary }]}>{row.canonicalItemName}</Text>
                  <Text style={[styles.insightMeta, { color: textSecondary }]}>
                    {row.canonicalStoreName ?? "—"} · {row.regionBucket} · Avg ${row.averagePrice.toFixed(2)} · {row.dataPointCount} data pts
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: textSecondary }]}>Nearby community data will appear here when available.</Text>
            )
          ) : (
            <Text style={[styles.ctaText, { color: textSecondary }]}>
              Enable location in Profile to see nearby prices.
            </Text>
          )}

          {/* 6. Multi-Store Split */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>Multi-Store Split</Text>
          {basketInsights?.multiStoreRecommendation?.enabled && basketInsights.multiStoreRecommendation.stores?.length ? (
            <>
              {basketInsights.multiStoreRecommendation.stores.map((store, idx) => (
                <View key={`ms-${idx}`} style={styles.insightRow}>
                  <Text style={[styles.insightItem, { color: textPrimary }]}>{store.storeName}</Text>
                  <Text style={[styles.insightMeta, { color: textSecondary }]}>
                    Subtotal ${store.estimatedSubtotal.toFixed(2)}
                    {store.storeAddress ? ` · ${store.storeAddress}` : store.storeArea ? ` · ${store.storeArea}` : ""}
                  </Text>
                </View>
              ))}
              {basketInsights.multiStoreRecommendation.combinedTotal != null && (
                <Text style={[styles.insightMeta, { color: textSecondary }]}>
                  Combined ${basketInsights.multiStoreRecommendation.combinedTotal.toFixed(2)}
                  {basketInsights.multiStoreRecommendation.savingsVsBestSingleStore != null &&
                    ` · Saves $${basketInsights.multiStoreRecommendation.savingsVsBestSingleStore.toFixed(2)}`}
                </Text>
              )}
            </>
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary }]}>No split recommendation for this basket.</Text>
          )}
        </View>
      )}
    </ScrollView>

    <Modal visible={saveBasketModal} transparent animationType="fade">
      <View style={styles.saveBasketModalOverlay}>
        <View style={[styles.saveBasketModalCard, { backgroundColor: glass }]}>
          <Text style={[styles.saveBasketModalTitle, { color: textPrimary }]}>Save basket for later</Text>
          <TextInput
            style={[styles.saveBasketInput, { color: textPrimary, backgroundColor: bg }]}
            placeholder="Basket name (e.g. Weekly groceries)"
            placeholderTextColor={textSecondary}
            value={saveBasketName}
            onChangeText={setSaveBasketName}
            editable={!saveBasketLoading}
          />
          <View style={styles.saveBasketModalActions}>
            <TouchableOpacity
              style={[styles.saveBasketModalBtn, { backgroundColor: bg }]}
              onPress={() => setSaveBasketModal(false)}
              disabled={saveBasketLoading}
            >
              <Text style={[styles.saveBasketModalBtnText, { color: textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBasketModalBtn, { backgroundColor: IOS_BLUE }]}
              onPress={async () => {
                const name = saveBasketName.trim() || "My basket";
                setSaveBasketLoading(true);
                try {
                  await createSmartList(authToken ?? null, {
                    name,
                    items: basket.map((itemName) => ({ name: itemName, quantity: 1 })),
                  });
                  setSaveBasketModal(false);
                  Alert.alert("Saved", `"${name}" saved. Tap Load to use it later.`);
                } catch (e) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Could not save basket");
                } finally {
                  setSaveBasketLoading(false);
                }
              }}
              disabled={saveBasketLoading || basket.length === 0}
            >
              {saveBasketLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBasketModalBtnTextWhite}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={loadBasketModal} transparent animationType="fade">
      <View style={styles.saveBasketModalOverlay}>
        <View style={[styles.saveBasketModalCard, { backgroundColor: glass }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={[styles.saveBasketModalTitle, { color: textPrimary }]}>Load saved basket</Text>
            <TouchableOpacity onPress={() => setLoadBasketModal(false)} hitSlop={12}>
              <X size={24} color={textPrimary} />
            </TouchableOpacity>
          </View>
          {loadBasketLoading ? (
            <ActivityIndicator size="small" color={IOS_BLUE} style={{ marginVertical: 16 }} />
          ) : savedBaskets.length === 0 ? (
            <Text style={[styles.emptyText, { color: textSecondary }]}>No saved baskets. Save your current basket to see it here.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {savedBaskets.map((list) => (
                <TouchableOpacity
                  key={list.id}
                  style={[styles.loadBasketRow, { backgroundColor: bg }]}
                  onPress={() => {
                    setBasketStore(list.items.map((i) => i.name));
                    setLoadBasketModal(false);
                    setShowFinalized(false);
                    setBasketInsights(null);
                  }}
                >
                  <Text style={[styles.loadBasketName, { color: textPrimary }]} numberOfLines={1}>{list.name}</Text>
                  <Text style={[styles.loadBasketCount, { color: textSecondary }]}>{list.items.length} items</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>

    <LocationConsentModal
      visible={showLocationConsentModal}
      onChoose={handleLocationConsentChoice}
      isDarkMode={isDarkMode}
    />

    {/* Tile detail sheet */}
    <Modal visible={tileDetailDatum !== null} transparent animationType="slide">
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={() => setTileDetailDatum(null)}
      >
        <View
          style={[styles.tileDetailSheet, { backgroundColor: glass }]}
          onStartShouldSetResponder={() => true}
        >
          {tileDetailDatum && (
            <>
              <Text style={[styles.tileDetailTitle, { color: textPrimary }]}>{tileDetailDatum.category}</Text>
              <Text style={[styles.tileDetailValue, { color: textPrimary }]}>${tileDetailDatum.amount.toFixed(2)}</Text>
              {tileDetailDatum.detailLine ? (
                <Text style={[styles.tileDetailSub, { color: textSecondary }]}>{tileDetailDatum.detailLine}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.tileDetailClose, { borderColor: textSecondary }]}
                onPress={() => setTileDetailDatum(null)}
              >
                <Text style={[styles.tileDetailCloseText, { color: textPrimary }]}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: IOS_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  replyCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  replyText: { fontSize: 15, lineHeight: 22 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  sectionSubtext: { fontSize: 13, marginBottom: 10 },
  tipCard: { borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: IOS_BLUE },
  tipText: { fontSize: 13 },
  emptyText: { fontSize: 14, paddingVertical: 8 },
  basketCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    marginBottom: 16,
  },
  basketInputRow: { flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "center" },
  clearBasketBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  basketInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addBasketBtn: {
    backgroundColor: IOS_BLUE,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
  },
  addBasketBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  chipText: { fontSize: 14, fontWeight: "500" },
  finalizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
    minHeight: 48,
  },
  finalizeBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  finalizeRow: { flexDirection: "row", alignItems: "stretch", gap: 10, marginTop: 10 },
  saveBasketBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 100,
  },
  saveBasketBtnText: { fontSize: 13, fontWeight: "600" },
  saveBasketModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  saveBasketModalCard: { borderRadius: 16, padding: 20 },
  saveBasketModalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  saveBasketInput: { borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  saveBasketModalActions: { flexDirection: "row", gap: 12 },
  saveBasketModalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveBasketModalBtnText: { fontSize: 16, fontWeight: "600" },
  saveBasketModalBtnTextWhite: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  loadBasketRow: { padding: 14, borderRadius: 12, marginBottom: 8 },
  loadBasketName: { fontSize: 16, fontWeight: "600" },
  loadBasketCount: { fontSize: 12, marginTop: 2 },
  recommendedCard: { borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.5)" },
  recommendedLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  recommendedRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  recommendedStoreName: { fontSize: 18, fontWeight: "700", flex: 1 },
  recommendedTotal: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  recommendedAddressRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  recommendedAddress: { fontSize: 13, flex: 1 },
  confidenceHint: { fontSize: 12, marginBottom: 6 },
  navigateHint: { fontSize: 12, marginTop: 8, fontWeight: "500" },
  savingsText: { fontSize: 12, marginTop: 8 },
  insightsBlock: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  insightsTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  sectionHint: { fontSize: 12, marginBottom: 6, opacity: 0.9 },
  insightRow: { paddingVertical: 8 },
  insightItem: { fontSize: 15, fontWeight: "600" },
  insightMeta: { fontSize: 13, marginTop: 2 },
  ctaText: { fontSize: 13, lineHeight: 20 },
  emptyStateBlock: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    minHeight: 160,
  },
  bubbleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    minHeight: 100,
  },
  tileDetailSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  tileDetailTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  tileDetailValue: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  tileDetailSub: { fontSize: 14, marginBottom: 20 },
  tileDetailClose: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  tileDetailCloseText: { fontSize: 16, fontWeight: "600" },
});
