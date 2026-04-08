import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { Search, Sparkles, Send, Plus, X } from "lucide-react-native";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE, IOS_GREEN, IOS_RED, SPACING, RADIUS, SHADOW, TYPE, TOUCH } from "../../src/theme";
import { appQuery, getApiBase, healthCheck, getBasketInsights, getBasketSuggestions, recordBasketTermPreference } from "../../src/api/client";

type QueryResult = { answer: string; data?: Record<string, unknown>; meta?: { requestId: string; apiVersion: string } };

function cleanAnswer(s: string): string {
  const text = (s ?? "").toString();
  // Strip fenced code blocks if the backend/LLM returns them.
  const noFences = text.replace(/```[\s\S]*?```/g, "").trim();
  // Collapse excessive blank lines.
  const collapsed = noFences.replace(/\n{3,}/g, "\n\n").trim();
  // Guard against huge payloads breaking UI.
  return collapsed.length > 1800 ? `${collapsed.slice(0, 1800).trim()}…` : collapsed;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function splitLines(s: string): string[] {
  return (s || "")
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter((x) => x.length >= 1);
}

export default function SearchScreen() {
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);

  const basket = useStore((s) => s.basket ?? []);
  const setBasket = useStore((s) => s.setBasket);

  const [debug, setDebug] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ status: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const [basketInput, setBasketInput] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ label: string; matchScore: number; frequency: number }> | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [basketInsights, setBasketInsights] = useState<unknown>(null);

  const basketCsv = useMemo(() => basket.join(", "), [basket]);

  useFocusEffect(
    useCallback(() => {
      setApiError(null);
      healthCheck()
        .then((h) => setApiStatus(h))
        .catch((e) => setApiError(e instanceof Error ? e.message : "Health check failed"));
    }, [])
  );

  const runQuery = useCallback(
    async (q: string) => {
      setRunning(true);
      setResult(null);
      try {
        const r = (await appQuery(authToken ?? null, q)) as QueryResult;
        setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Query failed";
        setResult({ answer: msg });
      } finally {
        setRunning(false);
      }
    },
    [authToken]
  );

  const loadSuggestions = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setSuggestions(null);
        return;
      }
      setSuggestLoading(true);
      try {
        const s = await getBasketSuggestions(authToken ?? null, { query: trimmed, limit: 10 });
        setSuggestions(s.map((x) => ({ label: x.label, matchScore: x.matchScore, frequency: x.frequency })));
      } catch {
        setSuggestions(null);
      } finally {
        setSuggestLoading(false);
      }
    },
    [authToken]
  );

  const finalizeBasket = useCallback(async () => {
    if (basket.length === 0) {
      Alert.alert("Basket is empty", "Add a few items first.");
      return;
    }
    setInsightsLoading(true);
    setBasketInsights(null);
    try {
      const res = await getBasketInsights(authToken ?? null, { itemNames: basket });
      setBasketInsights(res);
    } catch (e) {
      setBasketInsights({ error: e instanceof Error ? e.message : "Finalize failed" });
    } finally {
      setInsightsLoading(false);
    }
  }, [authToken, basket]);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: textPrimary }]}>Search</Text>
        <Text style={[styles.sub, { color: textSecondary }]}>
          API: {getApiBase()}
          {apiStatus ? ` · health: ${apiStatus.status}` : ""}
          {apiError ? ` · health error` : ""}
        </Text>

        <View style={[styles.card, { backgroundColor: glass }, SHADOW.card]}>
          <View style={styles.headerRow}>
            <Text style={[styles.sectionTitleInline, { color: textPrimary }]}>Ask anything</Text>
            <TouchableOpacity
              onPress={() => setDebug((v) => !v)}
              style={[
                styles.debugPill,
                { borderColor: debug ? IOS_BLUE : "rgba(255,255,255,0.2)", backgroundColor: debug ? "rgba(10,132,255,0.12)" : "transparent" },
              ]}
              hitSlop={8}
            >
              <Text style={[styles.debugPillText, { color: debug ? IOS_BLUE : textSecondary }]}>{debug ? "Debug: ON" : "Debug"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <Search size={18} color={textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Try: spend by category, spend by store, milk, cheapest store for milk"
              placeholderTextColor={textSecondary}
              style={[styles.input, { color: textPrimary }]}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => runQuery(query.trim() || "summary")}
            />
            <TouchableOpacity
              onPress={() => runQuery(query.trim() || "summary")}
              style={[styles.iconBtn, { backgroundColor: IOS_BLUE }]}
              disabled={running}
            >
              {running ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>

          <View style={styles.presetRow}>
            <TouchableOpacity style={[styles.pill, { borderColor: "rgba(255,255,255,0.2)" }]} onPress={() => runQuery("spend by category")}>
              <Text style={[styles.pillText, { color: IOS_BLUE }]}>Spend by category</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, { borderColor: "rgba(255,255,255,0.2)" }]} onPress={() => runQuery("spend by store")}>
              <Text style={[styles.pillText, { color: IOS_BLUE }]}>Spend by store</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, { borderColor: "rgba(255,255,255,0.2)" }]} onPress={() => runQuery("recent purchases")}>
              <Text style={[styles.pillText, { color: IOS_BLUE }]}>Recent</Text>
            </TouchableOpacity>
          </View>

          {result ? (
            <View style={styles.resultBlock}>
              <View style={styles.resultHeader}>
                <Sparkles size={18} color={result.answer.toLowerCase().includes("error") ? IOS_RED : IOS_GREEN} />
                <Text style={[styles.resultTitle, { color: textPrimary }]}>Result</Text>
                <Text style={[styles.resultMeta, { color: textSecondary }]} numberOfLines={1}>
                  {debug && result.meta?.requestId ? `req ${result.meta.requestId}` : ""}
                </Text>
              </View>
              <Text style={[styles.answer, { color: textPrimary }]}>{cleanAnswer(result.answer)}</Text>

              {Array.isArray((result.data as any)?.byCategory) ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.smallHeader, { color: textSecondary }]}>By category</Text>
                  {((result.data as any).byCategory as Array<{ category: string; amount: number }>).slice(0, 12).map((c) => (
                    <View key={c.category} style={styles.kvRow}>
                      <Text style={[styles.kvKey, { color: textPrimary }]} numberOfLines={1}>
                        {c.category}
                      </Text>
                      <Text style={[styles.kvVal, { color: textPrimary }]}>${Number(c.amount).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {debug ? (
                <>
                  <Text style={[styles.smallHeader, { color: textSecondary, marginTop: 12 }]}>Raw data</Text>
                  <Text style={[styles.mono, { color: textSecondary }]} selectable>
                    {safeJson(result.data ?? {})}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: glass }, SHADOW.card]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Basket</Text>
          <Text style={[styles.sectionHint, { color: textSecondary }]}>Add items, then Finalize for estimate + best store.</Text>

          <View style={styles.row}>
            <TextInput
              value={basketInput}
              onChangeText={(t) => {
                setBasketInput(t);
                loadSuggestions(t);
              }}
              placeholder="milk, eggs, bread…"
              placeholderTextColor={textSecondary}
              style={[styles.input, { color: textPrimary }]}
              autoCapitalize="none"
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => {
                const items = splitLines(basketInput);
                if (items.length === 0) return;
                const tooShort = items.find((x) => x.trim().length <= 3);
                if (tooShort) {
                  Alert.alert(
                    "Use a full item name",
                    `"${tooShort}" is too short. Type the full item (e.g. "bread"), or tap a suggestion.`
                  );
                  return;
                }
                setBasket((prev) => [...(prev ?? []), ...items].slice(0, 30));
                setBasketInput("");
                setSuggestions(null);
              }}
              style={[styles.iconBtn, { backgroundColor: IOS_BLUE }]}
            >
              <Plus size={18} color="#FFF" />
            </TouchableOpacity>
          </View>

          {suggestLoading ? <ActivityIndicator size="small" color={IOS_BLUE} style={{ marginTop: 8 }} /> : null}
          {suggestions && suggestions.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {suggestions.slice(0, 8).map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={styles.suggestionRow}
                  onPress={async () => {
                    setBasket((prev) => [...(prev ?? []), s.label].slice(0, 30));
                    setBasketInput("");
                    setSuggestions(null);
                    try {
                      await recordBasketTermPreference(authToken ?? null, basketInput.trim().toLowerCase(), s.label);
                    } catch {}
                  }}
                >
                  <Text style={[styles.suggestionText, { color: textPrimary }]} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text style={[styles.suggestionMeta, { color: textSecondary }]}>
                    score {s.matchScore.toFixed(2)} · freq {s.frequency}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {basket.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <View style={styles.basketHeader}>
                <Text style={[styles.smallHeader, { color: textSecondary }]}>Current basket</Text>
                <TouchableOpacity onPress={() => setBasket([])} hitSlop={12}>
                  <X size={18} color={IOS_RED} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.basketText, { color: textPrimary }]}>{basketCsv}</Text>
            </View>
          ) : (
            <Text style={[styles.sectionHint, { color: textSecondary, marginTop: 10 }]}>No items yet.</Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: IOS_BLUE, opacity: insightsLoading ? 0.8 : 1 }]}
            onPress={finalizeBasket}
            disabled={insightsLoading}
          >
            {insightsLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Finalize</Text>
            )}
          </TouchableOpacity>

          {basketInsights ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.smallHeader, { color: textSecondary }]}>Finalize</Text>
              {debug ? (
                <Text style={[styles.mono, { color: textSecondary }]} selectable>
                  {safeJson(basketInsights)}
                </Text>
              ) : (
                <Text style={[styles.sectionHint, { color: textSecondary }]}>
                  Done. If something looks off, enable Debug to see the response payload.
                </Text>
              )}
            </View>
          ) : null}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 56, paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 32 },
  title: { fontSize: TYPE.pageTitle, fontWeight: "800", marginBottom: 6 },
  sub: { fontSize: TYPE.helper, marginBottom: 18 },
  card: {
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitleInline: { fontSize: TYPE.secondary, fontWeight: "700" },
  debugPill: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  debugPillText: { fontSize: TYPE.helper, fontWeight: "800" },
  sectionTitle: { fontSize: TYPE.sectionTitle, fontWeight: "700", marginBottom: 6 },
  sectionHint: { fontSize: TYPE.secondary, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, minHeight: TOUCH.minHeight, fontSize: TYPE.body },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  pill: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: TYPE.helper, fontWeight: "700" },
  resultBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  resultTitle: { fontSize: TYPE.secondary, fontWeight: "700" },
  resultMeta: { flex: 1, fontSize: TYPE.helper, textAlign: "right" },
  answer: { fontSize: TYPE.body, lineHeight: 22 },
  smallHeader: { fontSize: TYPE.helper, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  mono: { marginTop: 6, fontSize: 12, fontFamily: "Courier", lineHeight: 16 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  kvKey: { flex: 1, fontSize: TYPE.secondary },
  kvVal: { fontSize: TYPE.secondary, fontWeight: "700" },
  suggestionRow: { paddingVertical: 10 },
  suggestionText: { fontSize: TYPE.body, fontWeight: "600" },
  suggestionMeta: { marginTop: 2, fontSize: TYPE.helper },
  basketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  basketText: { marginTop: 6, fontSize: TYPE.secondary, lineHeight: 20 },
  primaryBtn: {
    marginTop: 12,
    height: TOUCH.minHeightButton,
    borderRadius: RADIUS.button,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFF", fontSize: TYPE.body, fontWeight: "700" },
});

