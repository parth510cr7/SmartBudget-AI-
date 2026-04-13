import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
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
  Switch,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import type { LucideProps } from "lucide-react-native";
import {
  Send,
  ShoppingBasket,
  Trash2,
  Plus,
  X,
  Store,
  PieChart,
  TrendingUp,
  Tag,
  AlertCircle,
  Copy,
  RefreshCw,
} from "lucide-react-native";
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
  looksLikeBasketList,
  mergeBasketItems,
  newMessageId,
  splitBasketItemsFromFreeText,
} from "../../src/features/search/searchUtils";
import {
  clearSearchChatStorage,
  loadSearchChatState,
  loadSearchLeavePreference,
  saveSearchChatState,
  saveSearchLeavePreference,
  type SearchChatLeaveBehavior,
} from "../../src/features/search/searchStorage";

const CARD_PADDING = 18;
const BUBBLE_GAP = 12;

type QuickChip = { label: string; text: string; Icon: ComponentType<LucideProps> };

export default function AssistantScreen() {
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  const basket = useStore((s) => s.basket ?? []);
  const setBasket = useStore((s) => s.setBasket);
  const refreshKey = useStore((s) => s.refreshKey ?? 0);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const leaveBehaviorRef = useRef<SearchChatLeaveBehavior>("persist");

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
  const [expandedAssistantIds, setExpandedAssistantIds] = useState<Record<string, boolean>>({});
  const [leaveBehavior, setLeaveBehavior] = useState<SearchChatLeaveBehavior>("persist");

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
      return () => {
        if (leaveBehaviorRef.current === "clear_on_leave") {
          setMessages([]);
          setExpandedAssistantIds({});
          void clearSearchChatStorage();
        }
      };
    }, [loadSearchStats, refreshKey])
  );

  useEffect(() => {
    void loadSearchLeavePreference().then((b) => {
      leaveBehaviorRef.current = b;
      setLeaveBehavior(b);
    });
  }, []);

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
      setSearchHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!searchHydrated) return;
    void saveSearchChatState({ messages, searchMode: "chat" });
  }, [messages, searchHydrated]);

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

  useEffect(() => {
    if (running) {
      shouldAutoScrollRef.current = true;
      scrollToBottomSoon();
    }
  }, [running, scrollToBottomSoon]);

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

  const regenerateAssistantReply = useCallback(
    async (assistantId: string) => {
      const prev = messagesRef.current;
      const i = prev.findIndex((m) => m.id === assistantId);
      if (i < 1) return;
      const userMsg = prev[i - 1];
      if (userMsg.role !== "user") return;
      const q = userMsg.text;
      setMessages(prev.slice(0, i));
      setExpandedAssistantIds((ex) => {
        const next = { ...ex };
        delete next[assistantId];
        return next;
      });
      setRunning(true);
      shouldAutoScrollRef.current = true;
      scrollToBottomSoon();
      try {
        const r = await askSmartBudget(authToken ?? null, q);
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
    [appendMessage, authToken, scrollToBottomSoon]
  );

  const copyAssistantText = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(cleanAnswer(text));
    } catch {
      Alert.alert("Copy failed", "Could not copy to the clipboard.");
    }
  }, []);

  /** Phrases aligned with backend `detectIntent` in appQueryService (VERIFIED receipts only). */
  const quickPrompts = useMemo((): QuickChip[] => {
    return [
      { label: "Overview", text: "Summarize my spending overview.", Icon: PieChart },
      { label: "By store", text: "Show my spend by store.", Icon: Store },
      { label: "By category", text: "Show my spend by category.", Icon: Tag },
      { label: "Top category", text: "What is my top category?", Icon: TrendingUp },
      { label: "Recent buys", text: "What were my recent purchases?", Icon: ShoppingBasket },
    ];
  }, []);

  const dataChipsDisabled =
    !searchStatsLoading && searchStats != null && (searchStats.verifiedReceiptCount ?? 0) === 0;

  const onQuickAction = useCallback(
    (text: string) => {
      if (!searchHydrated) return;
      void send(text);
    },
    [searchHydrated, send]
  );

  const confirmClearChat = useCallback(() => {
    Alert.alert(
      "Clear conversation?",
      "This removes all messages in Assistant. You can’t undo this.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setMessages([]);
            setExpandedAssistantIds({});
            void clearSearchChatStorage();
            requestAnimationFrame(() => {
              try {
                listRef.current?.scrollToOffset({ offset: 0, animated: true });
              } catch {
                // ignore
              }
            });
          },
        },
      ]
    );
  }, []);

  const TAB_BAR_HEIGHT = 72;
  const tabBarBottom = Math.max(12, insets.bottom + 8);
  const tabBarReserve = TAB_BAR_HEIGHT + tabBarBottom;
  const [composerAreaHeight, setComposerAreaHeight] = useState(0);
  const [composerRowHeight, setComposerRowHeight] = useState(52);

  const hasChatMessages = messages.length > 0;

  const keyboardVerticalOffset = useMemo(() => {
    if (Platform.OS === "android") return 0;
    const headerPaddingTop = insets.top + 12;
    const titleRow = 44;
    const leavePrefRow = 44;
    const headerPaddingBottom = 8;
    return headerPaddingTop + titleRow + leavePrefRow + headerPaddingBottom;
  }, [insets.top]);

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
            Try an interpretive chip below, or ask your own question. Answers use your verified receipt data in context.
          </Text>
        </View>
      }
      ListFooterComponent={
        running ? (
          <View style={styles.thinkingFooter} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={IOS_BLUE} />
            <Text style={[styles.thinkingFooterText, { color: textSecondary }]}>Thinking…</Text>
          </View>
        ) : null
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
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={`You: ${item.text}`}
                style={[styles.bubble, { backgroundColor: IOS_BLUE, borderColor: bubbleBorder }]}
              >
                <Text style={[styles.bubbleText, { color: "#FFF" }]} importantForAccessibility="no">
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }

        const expanded = expandedAssistantIds[item.id] === true;
        const long = assistantSummaryLong(item.text);
        const isErr = item.meta?.kind === "error";
        const isBasketCta = item.meta?.kind === "basket_cta";
        const usePlainCard = !isErr && !isBasketCta;
        const isLastAssistant = index === messages.length - 1;
        const plainBg = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.045)";
        const plainBorder = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
        const actionDivider = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

        const body = (
          <>
            {!usePlainCard ? (
              <View style={styles.summaryCardLabelRow}>
                {isErr ? <AlertCircle size={16} color={IOS_RED} /> : null}
                <Text style={[styles.summaryCardLabel, { color: isErr ? IOS_RED : textSecondary, marginBottom: 0 }]}>
                  {isErr ? "Couldn't complete" : "Basket"}
                </Text>
              </View>
            ) : null}
            <Text
              style={[usePlainCard ? styles.assistantPlainBody : styles.summaryCardBody, { color: textPrimary }]}
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
                <Text style={[styles.showMoreText, { color: IOS_BLUE }]}>{expanded ? "Show less" : "Show more"}</Text>
              </TouchableOpacity>
            ) : null}
            {usePlainCard && long ? (
              <View style={[styles.assistantActionsRow, { borderTopColor: actionDivider }]}>
                <TouchableOpacity
                  style={styles.assistantActionBtn}
                  onPress={() => void copyAssistantText(item.text)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy answer"
                >
                  <Copy size={16} color={IOS_BLUE} />
                  <Text style={[styles.assistantActionLabel, { color: IOS_BLUE }]}>Copy</Text>
                </TouchableOpacity>
                {isLastAssistant && !running ? (
                  <TouchableOpacity
                    style={styles.assistantActionBtn}
                    onPress={() => void regenerateAssistantReply(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate answer"
                  >
                    <RefreshCw size={16} color={IOS_BLUE} />
                    <Text style={[styles.assistantActionLabel, { color: IOS_BLUE }]}>Regenerate</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
          </>
        );

        return (
          <View style={[styles.msgRow, { marginTop: index === 0 ? 0 : BUBBLE_GAP, justifyContent: "flex-start" }]}>
            {usePlainCard ? (
              <View style={[styles.assistantPlainOuter, { backgroundColor: plainBg, borderColor: plainBorder }]}>{body}</View>
            ) : (
              <GlassSurface isDark={isDarkMode} borderRadius={RADIUS.card} style={[LIQUID.shadow, styles.summaryCardOuter, isErr ? styles.summaryCardError : null]}>
                <View style={{ padding: CARD_PADDING }}>{body}</View>
              </GlassSurface>
            )}
          </View>
        );
      }}
    />
  );

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
                Assistant
              </Text>
            </View>
            <View style={styles.headerActions}>
              {messages.length > 0 ? (
                <TouchableOpacity
                  onPress={confirmClearChat}
                  style={styles.headerTextBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear conversation"
                >
                  <Text style={[styles.headerActionText, { color: IOS_BLUE }]}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.leavePrefRow} accessibilityLabel="Chat persistence">
            <Text style={[styles.leavePrefLabel, { color: textSecondary }]}>Clear chat when leaving this tab</Text>
            <Switch
              value={leaveBehavior === "clear_on_leave"}
              onValueChange={(v) => {
                const next: SearchChatLeaveBehavior = v ? "clear_on_leave" : "persist";
                leaveBehaviorRef.current = next;
                setLeaveBehavior(next);
                void saveSearchLeavePreference(next);
              }}
              trackColor={{
                false: isDarkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)",
                true: "rgba(10,132,255,0.4)",
              }}
              thumbColor={leaveBehavior === "clear_on_leave" ? IOS_BLUE : isDarkMode ? "#f2f2f7" : "#ffffff"}
              ios_backgroundColor={isDarkMode ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}
            />
          </View>
          {searchStatsLoading || searchStatsError ? null : null}
        </View>

        {renderChat()}

        <Modal visible={basketModalOpen} animationType="slide" transparent onRequestClose={() => setBasketModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalSheetWrap}>
              <View style={[styles.modalSheet, { backgroundColor: bg, paddingBottom: Math.max(16, insets.bottom + 10) }]}>
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
                <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {basket.length === 0 ? (
                    <Text style={[styles.modalEmpty, { color: textSecondary }]}>No items yet. Add lines below, or paste a list in chat.</Text>
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
                    {insightsLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalPrimaryBtnText}>Finalize</Text>}
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
              paddingTop: 10,
              paddingBottom: 10 + tabBarReserve,
            },
          ]}
          onLayout={(e) => setComposerAreaHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.chipRowOuter}>
            {dataChipsDisabled ? (
              <Text style={[styles.chipHelper, { color: textSecondary }]}>
                Verified receipts power these shortcuts (same as Insights). Scan one, then approve in Library if needed.
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={[styles.chipScroll, styles.chipScrollContent]}
              keyboardShouldPersistTaps="handled"
            >
              {quickPrompts.map((p, idx) => {
                const ChipIcon = p.Icon;
                const chipFill = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.92)";
                const chipBorder = isDarkMode ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.08)";
                const dimmed = dataChipsDisabled;
                return (
                  <View
                    key={`${p.label}-${idx}`}
                    style={[
                      styles.chipPill,
                      { backgroundColor: chipFill, borderColor: chipBorder, opacity: dimmed ? 0.55 : 1 },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.chipInner}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (!searchHydrated) return;
                        if (dataChipsDisabled) {
                          Alert.alert(
                            "No verified receipts yet",
                            "Assistant answers use the same verified totals as Insights. Scan a receipt and approve it in Library if it needs review.",
                            [
                              { text: "Not now", style: "cancel" },
                              { text: "Open scanner", onPress: () => router.push("/modal/scanner") },
                            ]
                          );
                          return;
                        }
                        onQuickAction(p.text);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.label}. ${p.text}`}
                    >
                      <ChipIcon size={14} color={IOS_BLUE} />
                      <Text style={[styles.chipText, { color: textPrimary }]}>{p.label}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.chipFadeRight}
            />
          </View>

          <GlassSurface isDark={isDarkMode} borderRadius={999} intensity={48} style={[LIQUID.shadow, styles.composerGlass]}>
            <View style={styles.composerRow} onLayout={(e) => setComposerRowHeight(e.nativeEvent.layout.height)}>
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
                {running || !searchHydrated ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFF" />}
              </TouchableOpacity>
            </View>
          </GlassSurface>
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
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  headerTextBtn: { paddingVertical: 10, paddingHorizontal: 8, minHeight: 44, justifyContent: "center" },
  headerActionText: { fontSize: TYPE.secondary, fontWeight: "700" },
  leavePrefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
    paddingRight: 2,
    paddingBottom: 4,
  },
  leavePrefLabel: { flex: 1, fontSize: TYPE.helper, fontWeight: "600", lineHeight: 18 },
  title: { fontSize: TYPE.pageTitle, fontWeight: "800", marginBottom: 2 },

  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: SPACING.pageHorizontal, paddingBottom: 10 },
  chatContentGrow: { flexGrow: 1 },
  chatEmptyWrap: { paddingVertical: 32, paddingHorizontal: 8 },
  chatEmptyText: { fontSize: TYPE.body, textAlign: "center", lineHeight: 22 },
  thinkingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: BUBBLE_GAP,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  thinkingFooterText: { fontSize: TYPE.secondary, fontWeight: "600" },

  msgRow: { flexDirection: "row" },
  bubble: {
    maxWidth: "84%",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bubbleText: { fontSize: TYPE.body, lineHeight: 21 },
  summaryCardOuter: { maxWidth: "100%", width: "100%" },
  summaryCardError: { borderLeftWidth: 3, borderLeftColor: IOS_RED },
  summaryCardLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  summaryCardLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  summaryCardBody: { fontSize: TYPE.body, lineHeight: 22 },
  assistantPlainOuter: {
    maxWidth: "100%",
    width: "100%",
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  assistantPlainBody: { fontSize: TYPE.body, lineHeight: 22 },
  assistantActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  assistantActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingVertical: 6,
    paddingRight: 8,
  },
  assistantActionLabel: { fontSize: TYPE.secondary, fontWeight: "700" },
  showMoreBtn: { marginTop: 10, paddingVertical: 4 },
  showMoreText: { fontSize: TYPE.secondary, fontWeight: "700" },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "center" },
  ctaBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },
  ctaBtnGhost: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  ctaGhostText: { fontSize: TYPE.secondary, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheetWrap: { width: "100%", maxHeight: "88%" },
  modalSheet: { borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card, paddingHorizontal: SPACING.pageHorizontal, paddingTop: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: TYPE.pageTitle, fontWeight: "800" },
  modalScroll: { maxHeight: 420 },
  modalEmpty: { fontSize: TYPE.body, lineHeight: 21, marginBottom: 12 },
  basketRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  basketRowText: { flex: 1, fontSize: TYPE.body },
  modalFieldLabel: { fontSize: TYPE.helper, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  modalAddRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.button, paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPE.body, minHeight: 44 },
  modalAddBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 8, alignItems: "center" },
  modalGhostBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modalGhostBtnText: { fontSize: TYPE.secondary, fontWeight: "800" },
  modalPrimaryBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalPrimaryBtnText: { color: "#FFF", fontSize: TYPE.secondary, fontWeight: "800" },

  chipRowOuter: { position: "relative", marginHorizontal: -4 },
  chipHelper: { fontSize: TYPE.helper, lineHeight: 18, marginBottom: 8, paddingHorizontal: 4 },
  chipScroll: { flexDirection: "row", gap: 8, paddingBottom: 10, paddingHorizontal: 0 },
  chipScrollContent: { paddingRight: 28 },
  chipFadeRight: { position: "absolute", right: 0, top: 0, bottom: 10, width: 36 },
  chipPill: { marginRight: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  chipInner: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingVertical: 10, paddingHorizontal: 14 },
  chipText: { fontSize: TYPE.secondary, fontWeight: "700" },

  composerGlass: { marginTop: 4 },
  composerWrap: { paddingHorizontal: SPACING.pageHorizontal, paddingTop: 10, paddingBottom: 10, position: "relative" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", paddingLeft: 6, paddingRight: 6, paddingVertical: 6, gap: 4 },
  composerBasketBtn: { position: "relative", width: 44, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  composerBasketBadge: { position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  composerBasketBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  composerInput: { flex: 1, minHeight: 22, fontSize: TYPE.body, lineHeight: 20, paddingVertical: 8, paddingHorizontal: 4 },
  sendBtnInline: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});

