import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Home, Camera, Users, PieChart, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { getTheme, IOS_BLUE, LIQUID, SPACING, TYPE } from "../theme";

type TabKey = "index" | "scan" | "shared" | "insights" | "assistant";

type TabItem = {
  key: TabKey;
  label: string;
  Icon: React.ComponentType<{ color: string; size: number }>;
};

const MAIN_TABS: TabItem[] = [
  { key: "index", label: "Home", Icon: Home },
  { key: "scan", label: "Scan", Icon: Camera },
  { key: "shared", label: "Shared", Icon: Users },
  { key: "insights", label: "Insights", Icon: PieChart },
];

const ASSISTANT_TAB: TabItem = { key: "assistant", label: "Assistant", Icon: Sparkles };

export const PILL_TAB_BAR_HEIGHT = 72;

export function pillTabBarReserve(insetsBottom: number) {
  const bottom = Math.max(12, insetsBottom + 8);
  return PILL_TAB_BAR_HEIGHT + bottom;
}

export function PillTabBar(props: BottomTabBarProps & { isDarkMode?: boolean }) {
  const insets = useSafeAreaInsets();
  const isDarkMode = props.isDarkMode ?? false;
  const { textPrimary, textSecondary, bg } = getTheme(isDarkMode);

  const tabBarBottom = Math.max(12, insets.bottom + 8);

  const focusedRouteName = props.state.routes[props.state.index]?.name ?? "";

  const routeNameToKey = useMemo(() => {
    const map = new Map<string, TabKey>();
    for (const r of props.state.routes) {
      if (r.name === "index") map.set(r.name, "index");
      if (r.name === "scan") map.set(r.name, "scan");
      if (r.name === "shared") map.set(r.name, "shared");
      if (r.name === "insights") map.set(r.name, "insights");
      if (r.name === "assistant") map.set(r.name, "assistant");
    }
    return map;
  }, [props.state.routes]);

  const isFocused = (key: TabKey) => {
    const currentKey = routeNameToKey.get(focusedRouteName);
    return currentKey === key;
  };

  const go = (key: TabKey) => {
    // Route names match file names in `app/(tabs)/`.
    props.navigation.navigate(key);
  };

  const activeBg = "rgba(10,132,255,0.16)";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.wrap,
          {
            left: SPACING.pageHorizontal,
            right: SPACING.pageHorizontal,
            bottom: tabBarBottom,
          },
        ]}
        pointerEvents="box-none"
      >
        <GlassSurface
          isDark={isDarkMode}
          borderRadius={36}
          intensity={isDarkMode ? 50 : 68}
          style={[LIQUID.shadow, styles.mainPill]}
        >
          <View style={styles.mainRow}>
            {MAIN_TABS.map((t) => {
              const focused = isFocused(t.key);
              const color = focused ? IOS_BLUE : textSecondary;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => go(t.key)}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: focused }}
                  style={[styles.mainItem, focused ? { backgroundColor: activeBg } : null]}
                  activeOpacity={0.85}
                >
                  <t.Icon color={color} size={20} />
                  <Text style={[styles.mainLabel, { color: focused ? textPrimary : textSecondary }]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassSurface>

        <GlassSurface
          isDark={isDarkMode}
          borderRadius={36}
          intensity={isDarkMode ? 50 : 68}
          style={[LIQUID.shadow, styles.assistantPill, { backgroundColor: "transparent" }]}
        >
          <TouchableOpacity
            onPress={() => go(ASSISTANT_TAB.key)}
            accessibilityRole="button"
            accessibilityLabel={ASSISTANT_TAB.label}
            accessibilityState={{ selected: isFocused(ASSISTANT_TAB.key) }}
            style={[
              styles.assistantBtn,
              isFocused(ASSISTANT_TAB.key) ? { backgroundColor: activeBg } : null,
            ]}
            activeOpacity={0.85}
          >
            <ASSISTANT_TAB.Icon
              color={isFocused(ASSISTANT_TAB.key) ? IOS_BLUE : textSecondary}
              size={22}
            />
          </TouchableOpacity>
        </GlassSurface>
      </View>

      {/* A tiny fade helps avoid harsh edge over content */}
      <View pointerEvents="none" style={[styles.fade, { backgroundColor: bg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: PILL_TAB_BAR_HEIGHT,
  },
  mainPill: {
    flex: 1,
    height: PILL_TAB_BAR_HEIGHT,
  },
  mainRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    padding: 6,
    gap: 6,
  },
  mainItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  mainLabel: {
    fontSize: TYPE.helper,
    fontWeight: "700",
  },
  assistantPill: {
    width: PILL_TAB_BAR_HEIGHT,
    height: PILL_TAB_BAR_HEIGHT,
  },
  assistantBtn: {
    flex: 1,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    opacity: 0.001,
  },
});

