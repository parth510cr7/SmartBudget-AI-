import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Keyboard,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Send, Sparkles, ShoppingBasket, Trash2, Plus, X, Store, Tag, CalendarDays, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, IOS_RED, LIQUID, SPACING, RADIUS, TYPE } from "../../src/theme";
import { askSmartBudget, getBasketInsights, getSearchStats, type SearchStatsResponse } from "../../src/api/client";
import {
  type ChatMessage,
  buildBasketFinalizeMessage,
  cleanAnswer,
  friendlyChatError,
  fmtMoney,
  looksLikeBasketList,
  mergeBasketItems,
  newMessageId,
  splitBasketItemsFromFreeText,
} from "../../src/features/search/searchUtils";
import { loadSearchChatState, saveSearchChatState, type SearchScreenMode } from "../../src/features/search/searchStorage";
import { storeInitials } from "../../src/features/search/searchUiHelpers";

const SECTION_GAP = 24;
const CARD_PADDING = 18;
const BUBBLE_GAP = 12;

function emptyStats(): Pick<
  SearchStatsResponse,
  "topCategories" | "topStoresBySpend" | "topStoresByVisits"
> {
  return { topCategories: [], topStoresBySpend: [], topStoresByVisits: [] };
}

export default function SearchScreen() {
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  const basket = useStore((s) => s.basket ?? []);
  const setBasket = useStore((s) => s.setBasket);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const [composer, setComposer] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [searchStatsLoading, setSearchStatsLoading] = useState(false);
  const [searchStatsError, setSearchStatsError] = useState<string | null>(null);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [basketModalOpen, setBasketModalOpen] = useState(false);
  const [manualLine, setManualLine] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [composerInputHeight, setComposerInputHeight] = useState(22);
  const [searchHydrated, setSearchHydrated] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchScreenMode>("insights");
  const [expandedAssistantIds, setExpandedAssistantIds] = useState<Record<string, boolean>>({});

  const statsSafe = useMemo(() => {
    if (!searchStats) return { ...emptyStats(), last30Days: { totalSpend: 0, avgPerDay: 0 } };
    return {
      topCategories: searchStats.topCategories ?? [],
      topStoresBySpend: searchStats.topStoresBySpend ?? [],
      topStoresByVisits: searchStats.topStoresByVisits ?? [],
      last30Days: searchStats.last30Days,
      community: searchStats.community,
      mostVisitedStore: searchStats.mostVisitedStore,
      topCategory: searchStats.topCategory,
    };
  }, [searchStats]);

  const loadSearchStats = useCallback(() => {
    setSearchStatsError(null);
    setSearchStatsLoading(true);
    getSearchStats(authToken ?? null)
      .then((d) => setSearchStats(d))
      .catch((e) => {
        setSearchStats(null);
        setSearchStatsError(friendlyChatError(e));
      })
      .finally(() => setSearchStatsLoading(false));
  }, [authToken]);

  useFocusEffect(
    useCallback(() => {
      loadSearchStats();
    }, [loadSearchStats, refreshKey])
  );

  useEffect(() => {
    let cancelled = false;
    loadSearchChatState().then((s) => {
      if (cancelled) return;
      if (!s) {
        setSearchHydrated(true);
        return;
      }
      if (messagesRef.current.length > 0) {
        setSearchHydrated(true);
        return;
      }
      setMessages(s.messages);
      setSearchMode(s.searchMode ?? "insights");
      setSearchHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!searchHydrated) return;
    void saveSearchChatState({ messages, searchMode });
  }, [messages, searchMode, searchHydrated]);

  const appendMessage = useCallback((m: Omit<ChatMessage, "id" | "createdAt">) => {
    setMessages((prev) => [...prev, { ...m, id: newMessageId(m.role), createdAt: Date.now() }]);
  }, []);

  const scrollToBottomSoon = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToEnd({ animated: true });
      } catch {
        // ignore
      }
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      if (searchMode === "chat" && messages.length > 0) {
        shouldAutoScrollRef.current = true;
        scrollToBottomSoon();
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [messages.length, scrollToBottomSoon, searchMode]);

  const finalizeBasket = useCallback(async () => {
    if (basket.length === 0) {
      Alert.alert("Basket is empty", "Add a few items first.");
      return;
    }
    setSearchMode("chat");
    setInsightsLoading(true);
    try {
      const res = await getBasketInsights(authToken ?? null, { itemNames: basket });
      appendMessage({
        role: "assistant",
        text: cleanAnswer(buildBasketFinalizeMessage(res)),
      });
    } catch (e) {
      appendMessage({
        role: "assistant",
        text: friendlyChatError(e),
        meta: { kind: "error" },
      });
    } finally {
      setInsightsLoading(false);
      scrollToBottomSoon();
    }
  }, [appendMessage, authToken, basket, scrollToBottomSoon]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      if (!searchHydrated) return;

      setSearchMode("chat");
      shouldAutoScrollRef.current = true;
      appendMessage({ role: "user", text: trimmed });
      setComposer("");
      setComposerInputHeight(22);
      scrollToBottomSoon();

      if (looksLikeBasketList(trimmed)) {
        const items = splitBasketItemsFromFreeText(trimmed);
        if (items.length > 0) {
          let addedCount = 0;
          setBasket((prev) => {
            const r = mergeBasketItems(prev ?? [], items, 30);
            addedCount = r.addedCount;
            return r.next;
          });
          appendMessage({
            role: "assistant",
            text:
              addedCount > 0
                ? `Added ${addedCount} item${addedCount === 1 ? "" : "s"} to your basket. Want me to finalize an estimate + best store?`
                : "Those items are already in your basket. Want me to finalize an estimate + best store?",
            meta: { kind: "basket_cta" },
          });
          scrollToBottomSoon();
          return;
        }
      }

      setRunning(true);
      try {
        const r = await askSmartBudget(authToken ?? null, trimmed);
        appendMessage({ role: "assistant", text: cleanAnswer(r.reply || "Done.") });
      } catch (e) {
        appendMessage({
          role: "assistant",
          text: friendlyChatError(e),
          meta: { kind: "error" },
        });
      } finally {
        setRunning(false);
        scrollToBottomSoon();
      }
    },
    [appendMessage, authToken, searchHydrated, scrollToBottomSoon, setBasket]
  );

  const quickPrompts = useMemo(
    () => [
      { label: "This month", text: "Summarize my spending this month." },
      { label: "Top stores", text: "Which stores did I spend the most at?" },
      { label: "Recent buys", text: "What did I buy recently?" },
    ],
    []
  );

  const onQuickAction = useCallback(
    (text: string) => {
      if (!searchHydrated) return;
      setSearchMode("chat");
      void send(text);
    },
    [searchHydrated, send]
  );

  const clearChatAndInsights = useCallback(() => {
    setMessages([]);
    setSearchMode("insights");
    setExpandedAssistantIds({});
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch {
        // ignore
      }
    });
  }, []);

  const TAB_BAR_HEIGHT = 72;
  const tabBarBottom = Math.max(12, insets.bottom + 8);
  const tabBarReserve = TAB_BAR_HEIGHT + tabBarBottom;
  const [composerAreaHeight, setComposerAreaHeight] = useState(0);
  const [composerRowHeight, setComposerRowHeight] = useState(52);

  const hasChatMessages = messages.length > 0;
  const isChatMode = searchMode === "chat";

  const keyboardVerticalOffset = useMemo(() => {
    if (Platform.OS === "android") return 0;
    const headerPaddingTop = insets.top + 12;
    const headerRowApprox = 44;
    const chromeApprox = searchMode === "insights" ? 56 : 0;
    const segmentApprox = 48;
    const headerPaddingBottom = 8;
    return headerPaddingTop + headerRowApprox + chromeApprox + segmentApprox + headerPaddingBottom;
  }, [insets.top, searchMode]);

  const listContentPaddingBottom = useMemo(() => {
    if (!hasChatMessages) {
      return keyboardOpen ? composerRowHeight + tabBarReserve + 18 : 16;
    }
    const measured = composerAreaHeight > 0 ? composerAreaHeight : 0;
    const fallback = composerRowHeight + tabBarReserve;
    return Math.max(measured, fallback) + 18;
  }, [hasChatMessages, keyboardOpen, composerAreaHeight, composerRowHeight, tabBarReserve]);

  const addManualLineToBasket = useCallback(() => {
    const t = manualLine.trim();
    if (!t) return;
    setBasket((prev) => mergeBasketItems(prev ?? [], [t], 30).next);
    setManualLine("");
  }, [manualLine, setBasket]);

  const removeBasketItemAt = useCallback(
    (index: number) => {
      setBasket((prev) => (prev ?? []).filter((_, i) => i !== index));
    },
    [setBasket]
  );

  const toggleAssistantExpand = useCallback((id: string) => {
    setExpandedAssistantIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const heroStore = statsSafe.topStoresBySpend[0];
  const heroInitials = heroStore ? storeInitials(heroStore.name) : "SB";

  const insightBar = (label: string, value: number, max: number, barColor: string) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
      <View style={styles.barRowWrap}>
        <View style={styles.barRowHeader}>
          <Text style={[styles.barRowLabel, { color: textPrimary }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.barRowValue, { color: textPrimary }]}>{fmtMoney(value)}</Text>
        </View>
        <View style={[styles.barTrack, { backgroundColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    );
  };

  const statLine = (icon: ReactNode, label: string, value: string) => (
    <View style={[styles.statRow, { borderColor: "rgba(255,255,255,0.1)" }]}>
      <View style={styles.statRowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statLabel, { color: textSecondary }]}>{label}</Text>
        <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );

  const maxCat = Math.max(0, ...statsSafe.topCategories.map((c) => c.amount));
  const maxSpend = Math.max(0, ...statsSafe.topStoresBySpend.map((s) => s.totalSpend));
  const maxVisits = Math.max(0, ...statsSafe.topStoresByVisits.map((s) => s.visits));

  const renderInsights = () => (
    <ScrollView
      style={styles.modeScroll}
      contentContainerStyle={[
        styles.insightsScrollInner,
        { paddingBottom: tabBarReserve + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {searchStatsLoading ? (
        <View style={styles.statsLoading}>
          <ActivityIndicator size="small" color={IOS_BLUE} />
        </View>
      ) : searchStatsError ? (
        <Text style={[styles.statsError, { color: textSecondary }]}>{searchStatsError}</Text>
      ) : (
        <>
          {heroStore ? (
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={LIQUID.shadow}>
              <View style={styles.heroCardInner}>
                <View style={[styles.heroAvatar, { backgroundColor: "rgba(10,132,255,0.22)" }]}>
                  <Text style={[styles.heroAvatarText, { color: IOS_BLUE }]}>{heroInitials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.heroEyebrow, { color: textSecondary }]}>Top spend</Text>
                  <Text style={[styles.heroTitle, { color: textPrimary }]} numberOfLines={2}>
                    {heroStore.name}
                  </Text>
                  <Text style={[styles.heroAmount, { color: textPrimary }]}>{fmtMoney(heroStore.totalSpend)}</Text>
                </View>
              </View>
            </GlassSurface>
          ) : null}

          <View style={{ marginTop: SECTION_GAP }}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Spending by category</Text>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
              <View style={{ padding: CARD_PADDING }}>
                {statsSafe.topCategories.length === 0 ? (
                  <Text style={{ color: textSecondary }}>No category data yet. Add verified receipts with item categories.</Text>
                ) : (
                  statsSafe.topCategories.map((c, i) => (
                    <View key={`cat-${i}-${c.name}`}>
                      {insightBar(c.name, c.amount, maxCat || 1, ["#34C759", "#007AFF", "#FF9500", "#AF52DE", "#FF3B30"][i % 5])}
                    </View>
                  ))
                )}
              </View>
            </GlassSurface>
          </View>

          <View style={{ marginTop: SECTION_GAP }}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Top stores by spend</Text>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
              <View style={{ padding: CARD_PADDING }}>
                {statsSafe.topStoresBySpend.length === 0 ? (
                  <Text style={{ color: textSecondary }}>No store spend data yet.</Text>
                ) : (
                  statsSafe.topStoresBySpend.map((s, i) => (
                    <View key={`spend-${i}-${s.name}`}>
                      {insightBar(s.name, s.totalSpend, maxSpend || 1, ["#007AFF", "#34C759", "#FF9500", "#AF52DE", "#5856D6"][i % 5])}
                    </View>
                  ))
                )}
              </View>
            </GlassSurface>
          </View>

          <View style={{ marginTop: SECTION_GAP }}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Store visits</Text>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
              <View style={{ padding: CARD_PADDING }}>
                {statsSafe.topStoresByVisits.length === 0 ? (
                  <Text style={{ color: textSecondary }}>No visits yet.</Text>
                ) : (
                  statsSafe.topStoresByVisits.map((s, i) => (
                    <View key={`vis-${i}-${s.name}`}>
                      {insightBar(`${s.name} (visits)`, s.visits, maxVisits || 1, ["#5AC8FA", "#007AFF", "#FF9500", "#FF2D55", "#32ADE6"][i % 5])}
                    </View>
                  ))
                )}
              </View>
            </GlassSurface>
          </View>

          <View style={{ marginTop: SECTION_GAP }}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Summary</Text>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, { marginTop: 12 }]}>
              <View style={{ padding: CARD_PADDING }}>
                {statLine(
                  <CalendarDays size={18} color={IOS_BLUE} />,
                  "Last 30 days (avg / day)",
                  searchStats ? `${fmtMoney(searchStats.last30Days.avgPerDay)} · ${fmtMoney(searchStats.last30Days.totalSpend)} total` : "—"
                )}
                {statLine(
                  <Users size={18} color={IOS_BLUE} />,
                  "Community avg price (weighted)",
                  searchStats?.community ? fmtMoney(searchStats.community.weightedAvgPrice) : "No community data yet"
                )}
                {searchStats?.mostVisitedStore ? (
                  statLine(
                    <Store size={18} color={IOS_BLUE} />,
                    "Most visited store",
                    `${searchStats.mostVisitedStore.name} · ${searchStats.mostVisitedStore.visits} visits`
                  )
                ) : null}
                {searchStats?.topCategory ? (
                  statLine(
                    <Tag size={18} color={IOS_BLUE} />,
                    "Top category",
                    `${searchStats.topCategory.name} · ${fmtMoney(searchStats.topCategory.amount)}`
                  )
                ) : null}
              </View>
            </GlassSurface>
          </View>
        </>
      )}
    </ScrollView>
  );

  const assistantSummaryLong = (text: string) => {
    const t = cleanAnswer(text);
    return t.length > 280 || t.split("\n").length > 6;
  };

  const renderChat = () => (
    <FlatList
      style={styles.chatList}
      ref={(r) => {
        listRef.current = r;
      }}
      data={messages}
      keyExtractor={(m) => m.id}
      contentContainerStyle={[
        styles.chatContent,
        hasChatMessages ? styles.chatContentGrow : null,
        { paddingBottom: listContentPaddingBottom, paddingTop: 4 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      ListEmptyComponent={
        <View style={styles.chatEmptyWrap}>
          <Text style={[styles.chatEmptyText, { color: textSecondary }]}>
            Try a suggestion below or ask about spending, stores, and prices.
          </Text>
        </View>
      }
      onContentSizeChange={() => {
        if (!hasChatMessages) return;
        if (!keyboardOpen && !shouldAutoScrollRef.current) return;
        shouldAutoScrollRef.current = false;
        scrollToBottomSoon();
      }}
      renderItem={({ item, index }) => {
        const isUser = item.role === "user";
        const bubbleBorder = isUser
          ? "rgba(255,255,255,0.12)"
          : isDarkMode
            ? "rgba(255,255,255,0.14)"
            : "rgba(0,0,0,0.10)";

        if (isUser) {
          return (
            <View style={[styles.msgRow, { marginTop: index === 0 ? 0 : BUBBLE_GAP, justifyContent: "flex-end" }]}>
              <View style={[styles.bubble, { backgroundColor: IOS_BLUE, borderColor: bubbleBorder }]}>
                <Text style={[styles.bubbleText, { color: "#FFF" }]}>{item.text}</Text>
              </View>
            </View>
          );
        }

        const expanded = expandedAssistantIds[item.id] === true;
        const long = assistantSummaryLong(item.text);

        return (
          <View style={[styles.msgRow, { marginTop: index === 0 ? 0 : BUBBLE_GAP, justifyContent: "flex-start" }]}>
            <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.summaryCardOuter]}>
              <View style={{ padding: CARD_PADDING }}>
              <Text style={[styles.summaryCardLabel, { color: textSecondary }]}>Summary</Text>
              <Text
                style={[styles.summaryCardBody, { color: textPrimary }]}
                numberOfLines={expanded || !long ? undefined : 5}
              >
                {cleanAnswer(item.text)}
              </Text>
              {long ? (
                <TouchableOpacity
                  onPress={() => toggleAssistantExpand(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? "Show less" : "Show more"}
                  style={styles.showMoreBtn}
                >
                  <Text style={[styles.showMoreText, { color: IOS_BLUE }]}>
                    {expanded ? "Show less" : "Show more"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {item.meta?.kind === "basket_cta" ? (
                <View style={styles.ctaRow}>
                  <TouchableOpacity
                    style={[styles.ctaBtn, { backgroundColor: IOS_BLUE, opacity: insightsLoading ? 0.8 : 1 }]}
                    onPress={finalizeBasket}
                    disabled={insightsLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Finalize basket"
                  >
                    {insightsLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ShoppingBasket size={16} color="#FFF" />
                        <Text style={styles.ctaBtnText}>Finalize basket</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ctaBtnGhost, { borderColor: "rgba(255,255,255,0.18)" }]}
                    onPress={() => setBasket([])}
                    accessibilityRole="button"
                    accessibilityLabel="Clear basket"
                  >
                    <Trash2 size={16} color={IOS_RED} />
                    <Text style={[styles.ctaGhostText, { color: IOS_RED }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              </View>
            </GlassSurface>
          </View>
        );
      }}
    />
  );

  const setSegment = useCallback((mode: SearchScreenMode) => {
    setSearchMode(mode);
    if (mode === "insights") {
      Keyboard.dismiss();
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.title, { color: textPrimary }]} numberOfLines={1} accessibilityRole="header">
                Search
              </Text>
            </View>
            {isChatMode && messages.length > 0 ? (
              <TouchableOpacity
                onPress={clearChatAndInsights}
                style={styles.headerCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear conversation"
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Text style={[styles.headerCloseText, { color: IOS_BLUE }]}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {searchMode === "insights" ? (
            <View style={styles.chromeRow} accessibilityLabel="Search and discovery">
              <GlassSurface isDark={isDarkMode} borderRadius={24} intensity={56} style={styles.chromeTileGlass}>
                <View style={styles.chromeTileInner}>
                  <Text style={[styles.chromeTileText, { color: IOS_BLUE }]}>{heroInitials}</Text>
                </View>
              </GlassSurface>
              <GlassSurface isDark={isDarkMode} borderRadius={14} intensity={52} style={styles.chromeSearchGlass}>
                <TextInput
                  ref={inputRef}
                  value={composer}
                  onChangeText={(t) => {
                    setComposer(t);
                    if (t.trim().length > 0) setSearchMode("chat");
                  }}
                  onFocus={() => setSearchMode("chat")}
                  placeholder="Search spending, stores, categories…"
                  placeholderTextColor={textSecondary}
                  style={[styles.chromeSearchField, { color: textPrimary }]}
                  returnKeyType="search"
                  editable={searchHydrated}
                  accessibilityLabel="Search your spending"
                />
              </GlassSurface>
            </View>
          ) : null}

          <GlassSurface isDark={isDarkMode} borderRadius={16} intensity={44} style={[LIQUID.shadow, styles.segmentGlass]}>
            <View style={styles.segmentWrap} accessibilityRole="tablist" accessibilityLabel="Search mode">
              <TouchableOpacity
                style={[styles.segmentBtn, searchMode === "chat" && styles.segmentBtnActive]}
                onPress={() => setSegment("chat")}
                accessibilityRole="tab"
                accessibilityState={{ selected: searchMode === "chat" }}
                accessibilityLabel="Chat"
              >
                <Text style={[styles.segmentBtnText, { color: searchMode === "chat" ? IOS_BLUE : textSecondary }]}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, searchMode === "insights" && styles.segmentBtnActive]}
                onPress={() => setSegment("insights")}
                accessibilityRole="tab"
                accessibilityState={{ selected: searchMode === "insights" }}
                accessibilityLabel="Insights"
              >
                <Text style={[styles.segmentBtnText, { color: searchMode === "insights" ? IOS_BLUE : textSecondary }]}>
                  Insights
                </Text>
              </TouchableOpacity>
            </View>
          </GlassSurface>
        </View>

        {searchMode === "insights" ? renderInsights() : renderChat()}

        <Modal
          visible={basketModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setBasketModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalSheetWrap}>
              <View
                style={[
                  styles.modalSheet,
                  { backgroundColor: bg, paddingBottom: Math.max(16, insets.bottom + 10) },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: textPrimary }]}>Basket</Text>
                  <TouchableOpacity
                    onPress={() => setBasketModalOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close basket"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <X size={22} color={textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.modalScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {basket.length === 0 ? (
                    <Text style={[styles.modalEmpty, { color: textSecondary }]}>
                      No items yet. Add lines below, or paste a list in chat.
                    </Text>
                  ) : (
                    basket.map((it, idx) => (
                      <View key={`${it}_${idx}`} style={[styles.basketRow, { borderColor: "rgba(255,255,255,0.12)" }]}>
                        <Text style={[styles.basketRowText, { color: textPrimary }]} numberOfLines={2}>
                          {it}
                        </Text>
                        <TouchableOpacity
                          onPress={() => removeBasketItemAt(idx)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${it}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={18} color={IOS_RED} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                  <Text style={[styles.modalFieldLabel, { color: textSecondary }]}>Add item</Text>
                  <View style={styles.modalAddRow}>
                    <TextInput
                      value={manualLine}
                      onChangeText={setManualLine}
                      placeholder="e.g. milk, eggs"
                      placeholderTextColor={textSecondary}
                      style={[styles.modalInput, { color: textPrimary, borderColor: "rgba(255,255,255,0.16)" }]}
                      onSubmitEditing={addManualLineToBasket}
                      returnKeyType="done"
                      accessibilityLabel="Add single basket item"
                    />
                    <TouchableOpacity
                      style={[styles.modalAddBtn, { backgroundColor: IOS_BLUE }]}
                      onPress={addManualLineToBasket}
                      accessibilityRole="button"
                      accessibilityLabel="Add item to basket"
                    >
                      <Plus size={20} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalGhostBtn, { borderColor: "rgba(255,255,255,0.2)" }]}
                    onPress={() => setBasket([])}
                    accessibilityRole="button"
                    accessibilityLabel="Clear basket"
                  >
                    <Text style={[styles.modalGhostBtnText, { color: IOS_RED }]}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { backgroundColor: IOS_BLUE, opacity: insightsLoading ? 0.75 : 1 }]}
                    onPress={async () => {
                      if (basket.length === 0) {
                        Alert.alert("Basket is empty", "Add a few items first.");
                        return;
                      }
                      setBasketModalOpen(false);
                      await finalizeBasket();
                    }}
                    disabled={insightsLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Finalize basket estimate"
                  >
                    {insightsLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalPrimaryBtnText}>Finalize</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {isChatMode ? (
          <View
            style={[
              styles.composerWrap,
              {
                backgroundColor: bg,
                borderTopColor: "rgba(255,255,255,0.12)",
                borderTopWidth: StyleSheet.hairlineWidth,
                paddingTop: 10,
                paddingBottom: 10 + tabBarReserve,
              },
            ]}
            onLayout={(e) => setComposerAreaHeight(e.nativeEvent.layout.height)}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
              keyboardShouldPersistTaps="handled"
            >
              {quickPrompts.map((p) => (
                <GlassSurface key={p.label} isDark={isDarkMode} borderRadius={999} intensity={38} style={styles.chipGlass}>
                  <TouchableOpacity
                    style={styles.chipInner}
                    onPress={() => onQuickAction(p.text)}
                    disabled={!searchHydrated}
                    accessibilityRole="button"
                    accessibilityLabel={p.label}
                  >
                    <Sparkles size={14} color={IOS_BLUE} />
                    <Text style={[styles.chipText, { color: textPrimary }]}>{p.label}</Text>
                  </TouchableOpacity>
                </GlassSurface>
              ))}
            </ScrollView>

            <GlassSurface isDark={isDarkMode} borderRadius={999} intensity={48} style={[LIQUID.shadow, styles.composerGlass]}>
            <View
              style={styles.composerRow}
              onLayout={(e) => setComposerRowHeight(e.nativeEvent.layout.height)}
            >
              <TouchableOpacity
                style={styles.composerBasketBtn}
                onPress={() => setBasketModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={basket.length ? `Basket, ${basket.length} items` : "Open basket"}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <ShoppingBasket size={22} color={IOS_BLUE} />
                {basket.length > 0 ? (
                  <View style={[styles.composerBasketBadge, { backgroundColor: IOS_BLUE }]}>
                    <Text style={styles.composerBasketBadgeText}>{basket.length > 9 ? "9+" : basket.length}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TextInput
                value={composer}
                onChangeText={setComposer}
                placeholder={searchHydrated ? "Ask about prices, stores, or spending…" : "Loading…"}
                placeholderTextColor={textSecondary}
                style={[styles.composerInput, { color: textPrimary, height: composerInputHeight }]}
                autoCapitalize="sentences"
                multiline
                returnKeyType="send"
                editable={searchHydrated}
                accessibilityLabel="Ask SmartBudget"
                scrollEnabled={composerInputHeight >= 96}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  const clamped = Math.max(22, Math.min(h, 96));
                  if (Math.abs(clamped - composerInputHeight) > 1) setComposerInputHeight(clamped);
                }}
                onSubmitEditing={() => {
                  if (Platform.OS !== "ios") send(composer);
                }}
              />
              <TouchableOpacity
                onPress={() => send(composer)}
                style={[
                  styles.sendBtnInline,
                  {
                    backgroundColor: IOS_BLUE,
                    opacity: !searchHydrated || running ? 0.7 : 1,
                  },
                ]}
                disabled={!searchHydrated || running}
                accessibilityRole="button"
                accessibilityLabel="Send"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {running || !searchHydrated ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Send size={18} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
            </GlassSurface>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1, position: "relative" },
  header: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  headerTitleWrap: { flex: 1, minWidth: 0, marginRight: 10, justifyContent: "center" },
  headerCloseBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCloseText: { fontSize: TYPE.secondary, fontWeight: "700" },
  title: { fontSize: TYPE.pageTitle, fontWeight: "800", marginBottom: 2 },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  chromeTileGlass: {
    width: 48,
    height: 48,
  },
  chromeTileInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  chromeTileText: { fontSize: 18, fontWeight: "800" },
  chromeSearchGlass: {
    flex: 1,
    minHeight: 46,
  },
  chromeSearchField: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: TYPE.body,
    backgroundColor: "transparent",
  },
  segmentGlass: {
    marginTop: 10,
    marginBottom: 4,
  },
  segmentWrap: {
    flexDirection: "row",
    gap: 8,
    padding: 6,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  segmentBtnActive: {
    backgroundColor: "rgba(10,132,255,0.18)",
  },
  segmentBtnText: { fontSize: TYPE.secondary, fontWeight: "800" },

  modeScroll: { flex: 1 },
  insightsScrollInner: {
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 8,
  },
  sectionTitle: { fontSize: TYPE.sectionTitle, fontWeight: "800" },
  heroCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: CARD_PADDING,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { fontSize: 20, fontWeight: "800" },
  heroEyebrow: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  heroTitle: { fontSize: TYPE.secondary, fontWeight: "800", marginTop: 2 },
  heroAmount: { fontSize: TYPE.pageTitle, fontWeight: "800", marginTop: 4 },
  barRowWrap: { marginBottom: 14 },
  barRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 },
  barRowLabel: { flex: 1, fontSize: TYPE.secondary, fontWeight: "600" },
  barRowValue: { fontSize: TYPE.secondary, fontWeight: "700" },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },

  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 10 },
  chatContentGrow: { flexGrow: 1 },
  chatEmptyWrap: { paddingVertical: 32, paddingHorizontal: 8 },
  chatEmptyText: { fontSize: TYPE.body, textAlign: "center", lineHeight: 22 },

  statsLoading: { paddingVertical: 24, alignItems: "center" },
  statsError: { fontSize: TYPE.body, lineHeight: 21 },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statRowIcon: { marginTop: 2, width: 24, alignItems: "center" },
  statLabel: { fontSize: TYPE.helper, fontWeight: "600", marginBottom: 4 },
  statValue: { fontSize: TYPE.body, fontWeight: "700", lineHeight: 21 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheetWrap: { width: "100%", maxHeight: "88%" },
  modalSheet: {
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 12,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: TYPE.pageTitle, fontWeight: "800" },
  modalScroll: { maxHeight: 420 },
  modalEmpty: { fontSize: TYPE.body, lineHeight: 21, marginBottom: 12 },
  basketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  basketRowText: { flex: 1, fontSize: TYPE.body },
  modalFieldLabel: { fontSize: TYPE.helper, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  modalAddRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: TYPE.body,
    minHeight: 44,
  },
  modalAddBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 8, alignItems: "center" },
  modalGhostBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostBtnText: { fontSize: TYPE.secondary, fontWeight: "800" },
  modalPrimaryBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalPrimaryBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },

  msgRow: { flexDirection: "row" },
  bubble: {
    maxWidth: "84%",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bubbleText: { fontSize: TYPE.body, lineHeight: 21 },
  summaryCardOuter: {
    maxWidth: "100%",
    width: "100%",
  },
  summaryCardLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  summaryCardBody: { fontSize: TYPE.body, lineHeight: 22 },
  showMoreBtn: { marginTop: 10, paddingVertical: 4 },
  showMoreText: { fontSize: TYPE.secondary, fontWeight: "700" },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "center" },
  ctaBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },
  ctaBtnGhost: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  ctaGhostText: { fontSize: TYPE.secondary, fontWeight: "700" },

  chipScroll: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 0,
  },
  chipGlass: {
    marginRight: 4,
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: { fontSize: TYPE.secondary, fontWeight: "700" },

  composerGlass: {
    marginTop: 4,
  },

  composerWrap: {
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    position: "relative",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 4,
  },
  composerBasketBtn: {
    position: "relative",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  composerBasketBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  composerBasketBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  composerInput: {
    flex: 1,
    minHeight: 22,
    fontSize: TYPE.body,
    lineHeight: 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sendBtnInline: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
