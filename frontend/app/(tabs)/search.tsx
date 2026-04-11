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
import { getTheme, IOS_BLUE, IOS_RED, SPACING, RADIUS, SHADOW, TYPE } from "../../src/theme";
import {
  appQuery,
  askSmartBudget,
  getBasketInsights,
  getSearchStats,
  type SearchStatsResponse,
} from "../../src/api/client";
import {
  type ChatMessage,
  type ChatEngine,
  buildBasketFinalizeMessage,
  cleanAnswer,
  friendlyChatError,
  fmtMoney,
  looksLikeBasketList,
  mergeBasketItems,
  newMessageId,
  splitBasketItemsFromFreeText,
} from "../../src/features/search/searchUtils";
import { loadSearchChatState, saveSearchChatState } from "../../src/features/search/searchStorage";

export default function SearchScreen() {
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  const basket = useStore((s) => s.basket ?? []);
  const setBasket = useStore((s) => s.setBasket);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);
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
  const [chatEngine, setChatEngine] = useState<ChatEngine>("data");
  const [searchHydrated, setSearchHydrated] = useState(false);

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
      // If the user already has messages (e.g. sent before load finished), do not overwrite.
      if (messagesRef.current.length > 0) {
        setSearchHydrated(true);
        return;
      }
      setMessages(s.messages);
      setChatEngine(s.chatEngine);
      setSearchHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!searchHydrated) return;
    void saveSearchChatState({ messages, chatEngine });
  }, [messages, chatEngine, searchHydrated]);

  const appendMessage = useCallback((m: Omit<ChatMessage, "id" | "createdAt">) => {
    setMessages((prev) => [...prev, { ...m, id: newMessageId(m.role), createdAt: Date.now() }]);
  }, []);

  // (Suggestions removed)

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
      if (messages.length > 0) {
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
  }, [messages.length, scrollToBottomSoon]);

  const finalizeBasket = useCallback(async () => {
    if (basket.length === 0) {
      Alert.alert("Basket is empty", "Add a few items first.");
      return;
    }
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

      shouldAutoScrollRef.current = true;
      appendMessage({ role: "user", text: trimmed });
      setComposer("");
      scrollToBottomSoon();

      // Auto-basket: if user pasted a list, build basket and offer finalize.
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
        if (chatEngine === "general") {
          const r = await askSmartBudget(authToken ?? null, trimmed);
          appendMessage({ role: "assistant", text: cleanAnswer(r.reply || "Done.") });
        } else {
          const r = await appQuery(authToken ?? null, trimmed);
          appendMessage({ role: "assistant", text: cleanAnswer(r.answer || "Done.") });
        }
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
    [appendMessage, authToken, chatEngine, searchHydrated, scrollToBottomSoon, setBasket]
  );

  const quickPrompts = useMemo(
    () => [
      { label: "This month summary", text: "Summarize my spending this month." },
      { label: "Top stores", text: "Which stores did I spend the most at?" },
      { label: "Recent purchases", text: "What did I buy recently?" },
    ],
    []
  );

  const isEmptySearch = messages.length === 0;
  const flatListData = messages;

  const closeChat = useCallback(() => {
    setMessages([]);
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
  /** Full height of composer column (padding + row + tab-bar reserve). Drives FlatList paddingBottom. */
  const [composerAreaHeight, setComposerAreaHeight] = useState(0);
  /** Inner row only — used for minimum padding before first layout. */
  const [composerRowHeight, setComposerRowHeight] = useState(52);

  const hasChatMessages = messages.length > 0;

  /** iOS: offset = distance from screen top to top of KAV inner content; matches custom header below status bar. */
  const keyboardVerticalOffset = useMemo(() => {
    if (Platform.OS === "android") return 0;
    const headerPaddingTop = insets.top + 12;
    const headerRowApprox = 44;
    const headerPaddingBottom = 8;
    return headerPaddingTop + headerRowApprox + headerPaddingBottom;
  }, [insets.top]);

  /** Scrollable bottom inset so the last bubble clears the composer + tab bar (uses measured composer column). */
  const listContentPaddingBottom = useMemo(() => {
    // When keyboard is open (even with no messages yet), reserve space so the chat surface
    // doesn't appear \"under\" the composer.
    if (!hasChatMessages) {
      return keyboardOpen ? composerRowHeight + tabBarReserve + 18 : 8;
    }
    // If we have a measured composer column, use it. Otherwise fall back to the core pieces
    // acceptance wants: composerRowHeight + tabBarReserve (+ a small safety gap).
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

  const promptRows = useMemo(
    () =>
      quickPrompts.map((p) => (
        <TouchableOpacity
          key={p.label}
          style={[
            styles.promptRow,
            { backgroundColor: glass, borderColor: "rgba(255,255,255,0.14)", opacity: searchHydrated ? 1 : 0.5 },
            SHADOW.card,
          ]}
          onPress={() => send(p.text)}
          disabled={!searchHydrated}
          accessibilityRole="button"
          accessibilityLabel={`Send prompt: ${p.label}`}
        >
          <Sparkles size={16} color={IOS_BLUE} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.promptRowLabel, { color: textPrimary }]}>{p.label}</Text>
            <Text style={[styles.promptRowHint, { color: textSecondary }]} numberOfLines={2}>
              {p.text}
            </Text>
          </View>
        </TouchableOpacity>
      )),
    [glass, quickPrompts, searchHydrated, send, textPrimary, textSecondary]
  );

  const listHeader = useMemo(() => {
    const chatStarter = (
      <View style={[styles.chatPromptsSection, styles.chatPromptsSectionBelowStats]}>
        <Text style={[styles.chatSurfaceHelper, { color: textSecondary }]}>Chat</Text>
        <Text style={[styles.chatPromptsSectionTitle, { color: textSecondary }]}>Try asking</Text>
        {promptRows}
      </View>
    );

    // When the keyboard is active, always present the surface as \"chat\" (even if there are no messages yet).
    if (!isEmptySearch || keyboardOpen) {
      return (
        <View style={styles.chatSectionHeader}>
          <Text style={[styles.chatSectionTitle, { color: textSecondary }]}>Conversation</Text>
        </View>
      );
    }

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

    return (
      <View style={{ paddingBottom: 2 }}>
        <View style={[styles.statsCard, { backgroundColor: glass, borderColor: "rgba(255,255,255,0.14)" }, SHADOW.card]}>
          <Text style={[styles.statsTitle, { color: textPrimary }]}>Your snapshot</Text>
          {searchStatsLoading ? (
            <View style={styles.statsLoading}>
              <ActivityIndicator size="small" color={IOS_BLUE} />
            </View>
          ) : searchStatsError ? (
            <Text style={[styles.statsError, { color: textSecondary }]}>{searchStatsError}</Text>
          ) : (
            <>
              {statLine(
                <Store size={18} color={IOS_BLUE} />,
                "Most visited store",
                searchStats?.mostVisitedStore
                  ? `${searchStats.mostVisitedStore.name} · ${searchStats.mostVisitedStore.visits} visit${
                      searchStats.mostVisitedStore.visits === 1 ? "" : "s"
                    }`
                  : "No data yet"
              )}
              {statLine(
                <Tag size={18} color={IOS_BLUE} />,
                "Most spent category",
                searchStats?.topCategory
                  ? `${searchStats.topCategory.name} · ${fmtMoney(searchStats.topCategory.amount)}`
                  : "No data yet"
              )}
              {statLine(
                <CalendarDays size={18} color={IOS_BLUE} />,
                "Avg spent / day (last 30 days)",
                searchStats ? `${fmtMoney(searchStats.last30Days.avgPerDay)} · receipts` : "—"
              )}
              {statLine(
                <Users size={18} color={IOS_BLUE} />,
                "Community avg price (weighted)",
                searchStats?.community
                  ? fmtMoney(searchStats.community.weightedAvgPrice)
                  : "No community data yet"
              )}
            </>
          )}
        </View>
        {chatStarter}
      </View>
    );
  }, [
    glass,
    isEmptySearch,
    keyboardOpen,
    searchStats,
    searchStatsError,
    searchStatsLoading,
    promptRows,
    textPrimary,
    textSecondary,
  ]);

  const listFooter = useMemo(() => {
    if (isEmptySearch || keyboardOpen) return null;
    return (
      <View style={[styles.chatPromptsSection, styles.chatPromptsSectionBelowChat]}>
        <Text style={[styles.chatPromptsSectionTitle, { color: textSecondary }]}>Try asking</Text>
        {promptRows}
      </View>
    );
  }, [isEmptySearch, keyboardOpen, promptRows, textSecondary]);

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
              <Text
                style={[styles.title, { color: textPrimary }]}
                numberOfLines={1}
                accessibilityRole="header"
              >
                Search
              </Text>
            </View>
            {messages.length > 0 ? (
              <TouchableOpacity
                onPress={closeChat}
                style={styles.headerCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close conversation"
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Text style={[styles.headerCloseText, { color: IOS_BLUE }]}>Close</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <FlatList
          style={styles.chatList}
          ref={(r) => {
            listRef.current = r;
          }}
          data={flatListData}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.chatContent,
            hasChatMessages ? styles.chatContentGrow : null,
            {
              paddingBottom: listContentPaddingBottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => {
            if (!hasChatMessages) return;
            if (!keyboardOpen && !shouldAutoScrollRef.current) return;
            shouldAutoScrollRef.current = false;
            scrollToBottomSoon();
          }}
          renderItem={({ item, index }) => {
            const isUser = item.role === "user";
            const assistantBubbleBg = isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
            const bubbleBg = isUser ? IOS_BLUE : assistantBubbleBg;
            const bubbleText = isUser ? "#FFF" : textPrimary;
            const bubbleBorder = isUser
              ? "rgba(255,255,255,0.12)"
              : isDarkMode
                ? "rgba(255,255,255,0.14)"
                : "rgba(0,0,0,0.10)";
            return (
              <View
                style={[
                  styles.msgRow,
                  { marginTop: index === 0 ? 6 : 12, justifyContent: isUser ? "flex-end" : "flex-start" },
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: bubbleBg, borderColor: bubbleBorder },
                    !isUser ? styles.assistantBubbleShadow : null,
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: bubbleText }]}>{item.text}</Text>
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
              </View>
            );
          }}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
        />

        <Modal
          visible={basketModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setBasketModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalSheetWrap}
            >
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
                      No items yet. Add lines below, or use chat to add several items at once (e.g. a list in one
                      message).
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

        <View
          style={[
            styles.composerWrap,
            {
              backgroundColor: bg,
              borderTopColor: "rgba(255,255,255,0.12)",
              borderTopWidth: StyleSheet.hairlineWidth,
              paddingTop: isEmptySearch ? 8 : 10,
              paddingBottom: 10 + tabBarReserve,
            },
          ]}
          onLayout={(e) => setComposerAreaHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.engineRow} accessibilityRole="tablist" accessibilityLabel="Chat mode">
            <TouchableOpacity
              style={[
                styles.engineChip,
                chatEngine === "data" && styles.engineChipActive,
                { borderColor: chatEngine === "data" ? IOS_BLUE : "rgba(255,255,255,0.18)", opacity: searchHydrated ? 1 : 0.5 },
              ]}
              onPress={() => setChatEngine("data")}
              disabled={!searchHydrated}
              accessibilityRole="tab"
              accessibilityState={{ selected: chatEngine === "data", disabled: !searchHydrated }}
              accessibilityLabel="Data answers from your receipts"
            >
              <Text style={[styles.engineChipText, { color: chatEngine === "data" ? IOS_BLUE : textSecondary }]}>
                Data
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.engineChip,
                chatEngine === "general" && styles.engineChipActive,
                {
                  borderColor: chatEngine === "general" ? IOS_BLUE : "rgba(255,255,255,0.18)",
                  opacity: searchHydrated ? 1 : 0.5,
                },
              ]}
              onPress={() => setChatEngine("general")}
              disabled={!searchHydrated}
              accessibilityRole="tab"
              accessibilityState={{ selected: chatEngine === "general", disabled: !searchHydrated }}
              accessibilityLabel="General assistant"
            >
              <Text style={[styles.engineChipText, { color: chatEngine === "general" ? IOS_BLUE : textSecondary }]}>
                General
              </Text>
            </TouchableOpacity>
          </View>
          <View
            style={[styles.composerRow, { backgroundColor: glass }, SHADOW.card]}
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
              placeholder={searchHydrated ? "Ask about prices, stores, or spending…" : "Loading saved chat…"}
              placeholderTextColor={textSecondary}
              style={[styles.composerInput, { color: textPrimary, height: composerInputHeight }]}
              autoCapitalize="sentences"
              multiline
              returnKeyType="send"
              editable={searchHydrated}
              accessibilityLabel="Ask SmartBudget"
              scrollEnabled={composerInputHeight >= 96}
              onContentSizeChange={(e) => {
                // Expand up to ~5 lines, then allow internal scrolling.
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
              {running ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : !searchHydrated ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Send size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
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
  sub: { fontSize: TYPE.helper },

  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 10 },
  chatContentGrow: { flexGrow: 1 },
  chatStripFixed: {
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatSurfaceHelper: { fontSize: TYPE.helper, fontWeight: "600", marginBottom: 6 },
  chatSectionHeader: { paddingTop: 2, paddingBottom: 10 },
  chatSectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  chatPromptsSection: { paddingBottom: 12 },
  chatPromptsSectionBelowStats: { marginTop: 6 },
  chatPromptsSectionBelowChat: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  chatPromptsSectionTitle: {
    fontSize: TYPE.helper,
    fontWeight: "800",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: RADIUS.button,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  promptRowLabel: { fontSize: TYPE.secondary, fontWeight: "700" },
  promptRowHint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  statsCard: {
    marginTop: 4,
    marginBottom: 14,
    padding: 16,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statsTitle: { fontSize: TYPE.sectionTitle, fontWeight: "800", marginBottom: 12 },
  statsLoading: { paddingVertical: 16, alignItems: "center" },
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
  assistantBubbleShadow: SHADOW.card,
  bubbleText: { fontSize: TYPE.body, lineHeight: 21 },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" },
  ctaBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },
  ctaBtnGhost: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  ctaGhostText: { fontSize: TYPE.secondary, fontWeight: "700" },

  engineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  engineChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: "center",
  },
  engineChipActive: {
    backgroundColor: "rgba(10,132,255,0.12)",
  },
  engineChipText: { fontSize: TYPE.secondary, fontWeight: "700" },
  composerWrap: {
    paddingHorizontal: SPACING.pageHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    position: "relative",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
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

