import { memo, useEffect, useMemo, useRef, type ComponentType } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import {
  Car,
  CircleDollarSign,
  Expand,
  HeartPulse,
  House,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Shrink,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react-native";
import { ExpandableDetailTile } from "./ExpandableDetailTile";
import type { GlassTheme } from "./glassTheme";
import type { InsightIconName, InsightTileModel } from "./types";

type IconComp = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const ICONS: Record<InsightIconName, IconComp> = {
  store: Store,
  cart: ShoppingCart,
  bag: ShoppingBag,
  home: House,
  car: Car,
  sparkles: Sparkles,
  heart: HeartPulse,
  utensils: Utensils,
  wallet: Wallet,
  dollar: CircleDollarSign,
  trend: TrendingUp,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type GlassTileProps = {
  tile: InsightTileModel;
  theme: GlassTheme;
  left: number;
  top: number;
  width: number;
  height: number;
  isSelected: boolean;
  isExpanded: boolean;
  isAdjusted: boolean;
  editMode: boolean;
  onPress: () => void;
  onExpand: () => void;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onDrop: (centerX: number, centerY: number) => void;
  onPromoteSize: () => void;
  onDemoteSize: () => void;
};

export const GlassTile = memo(function GlassTile({
  tile,
  theme,
  left,
  top,
  width,
  height,
  isSelected,
  isExpanded,
  isAdjusted,
  editMode,
  onPress,
  onExpand,
  onEnterEditMode,
  onExitEditMode,
  onDrop,
  onPromoteSize,
  onDemoteSize,
}: GlassTileProps) {
  const Icon = ICONS[tile.iconName] ?? CircleDollarSign;
  const isDisabled = tile.state === "disabled";
  const isLoading = tile.state === "loading";
  const longPressTriggeredRef = useRef(false);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const press = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragFocus = useSharedValue(0);
  const selectedFocus = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    selectedFocus.value = withTiming(isSelected ? 1 : 0, { duration: 180 });
  }, [isSelected, selectedFocus]);

  useEffect(() => {
    if (editMode) return;
    dragX.value = withTiming(0, { duration: 140 });
    dragY.value = withTiming(0, { duration: 140 });
    dragFocus.value = withTiming(0, { duration: 120 });
  }, [editMode, dragFocus, dragX, dragY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          editMode &&
          !isDisabled &&
          (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
        onPanResponderGrant: () => {
          dragFocus.value = withTiming(1, { duration: 90 });
        },
        onPanResponderMove: (_, gesture) => {
          if (!editMode || isDisabled) return;
          dragX.value = gesture.dx;
          dragY.value = gesture.dy;
        },
        onPanResponderRelease: (_, gesture) => {
          if (editMode && !isDisabled) {
            const centerX = left + gesture.dx + width / 2;
            const centerY = top + gesture.dy + height / 2;
            onDrop(centerX, centerY);
          }
          longPressTriggeredRef.current = false;
          dragX.value = withSpring(0, { stiffness: 280, damping: 24, mass: 0.6 });
          dragY.value = withSpring(0, { stiffness: 280, damping: 24, mass: 0.6 });
          dragFocus.value = withTiming(0, { duration: 140 });
        },
        onPanResponderTerminate: () => {
          longPressTriggeredRef.current = false;
          dragX.value = withSpring(0, { stiffness: 280, damping: 24, mass: 0.6 });
          dragY.value = withSpring(0, { stiffness: 280, damping: 24, mass: 0.6 });
          dragFocus.value = withTiming(0, { duration: 120 });
        },
      }),
    [dragFocus, dragX, dragY, editMode, isDisabled, left, onDrop, top, width, height]
  );

  const animatedWrap = useAnimatedStyle(() => {
    const scale = 1 - press.value * 0.022 + selectedFocus.value * 0.018 + dragFocus.value * 0.03;
    const translateY = press.value * 1.3 - selectedFocus.value * 1.1 + dragY.value;
    const translateX = dragX.value;
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      shadowOpacity: theme.cardShadowOpacity + selectedFocus.value * 0.08 + press.value * 0.04 + dragFocus.value * 0.06,
      shadowRadius: 7 + selectedFocus.value * 4 + press.value * 2 + dragFocus.value * 2,
      elevation: Math.round(theme.cardElevation + selectedFocus.value * 2 + press.value * 2 + dragFocus.value * 3),
      zIndex: isSelected ? 50 : 1 + Math.round(dragFocus.value * 160),
    };
  });

  const palette = useMemo(() => {
    if (isAdjusted) return theme.adjustedPalette;
    if (isSelected) return theme.selectedPalette;
    if (tile.kind === "store") return theme.cardPaletteStore[tile.paletteIndex % theme.cardPaletteStore.length];
    if (tile.kind === "summary") return theme.cardPaletteSummary[tile.paletteIndex % theme.cardPaletteSummary.length];
    return theme.cardPaletteCategory[tile.paletteIndex % theme.cardPaletteCategory.length];
  }, [isAdjusted, isSelected, tile.kind, tile.paletteIndex, theme]);

  const borderColor = isAdjusted ? theme.adjustedBorder : isSelected ? theme.selectedBorder : theme.cardBorder;
  const innerBorderColor = isAdjusted ? theme.adjustedBorder : isSelected ? theme.selectedBorder : theme.cardInnerBorder;
  const iconChipBg = isAdjusted
    ? theme.iconChipBackgroundAdjusted
    : isSelected
      ? theme.iconChipBackgroundSelected
      : theme.iconChipBackground;
  const iconChipBorder = isAdjusted
    ? theme.iconChipBorderAdjusted
    : isSelected
      ? theme.iconChipBorderSelected
      : theme.iconChipBorder;
  const titleColor = isAdjusted ? theme.adjustedTitleText : isSelected ? theme.selectedTitleText : theme.titleText;
  const valueColor = isAdjusted ? theme.adjustedValueText : isSelected ? theme.selectedValueText : theme.valueText;
  const iconColor = isDisabled ? theme.iconColorMuted : isSelected ? theme.iconColorSelected : theme.iconColorDefault;

  const minSide = Math.min(width, height);
  const titleSize = clamp(Math.round(minSide * 0.15), 11, 17);
  const valueSize = clamp(Math.round(minSide * 0.25), 15, 29);
  const showIcon = true;
  const showLabel = true;
  const showValue = true;
  const showSelectedQuick = isSelected && !isExpanded;
  const showExpanded = isExpanded;

  const detailLines = (tile.expandedLines ?? [tile.detailLine ?? ""]).filter(Boolean);
  const quickLines = (tile.quickStats ?? []).filter(Boolean).slice(0, 2);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrap,
        animatedWrap,
        {
          left,
          top,
          width,
          height,
          shadowColor: theme.cardShadow,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          onPress();
        }}
        disabled={isDisabled}
        onPressIn={() => {
          if (isDisabled) return;
          press.value = withSpring(1, { stiffness: 280, damping: 19, mass: 0.6 });

          if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
          if (editTimerRef.current) clearTimeout(editTimerRef.current);

          // Haptic Touch: short hold -> expanded detail
          expandTimerRef.current = setTimeout(() => {
            if (editMode || isDisabled) return;
            longPressTriggeredRef.current = true;
            onExpand();
          }, 280);

          // Control Center edit: longer hold -> enter/exit edit mode
          editTimerRef.current = setTimeout(() => {
            if (isDisabled) return;
            longPressTriggeredRef.current = true;
            if (editMode) onExitEditMode();
            else onEnterEditMode();
          }, 900);
        }}
        onPressOut={() => {
          if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
          if (editTimerRef.current) clearTimeout(editTimerRef.current);
          expandTimerRef.current = null;
          editTimerRef.current = null;
          if (isDisabled) return;
          press.value = withSpring(0, { stiffness: 260, damping: 20, mass: 0.6 });
        }}
        style={styles.pressable}
      >
        <LinearGradient
          colors={palette}
          start={{ x: 0.06, y: 0.06 }}
          end={{ x: 0.96, y: 0.94 }}
          style={[styles.surface, { borderColor }]}
        >
          <View pointerEvents="none" style={[styles.innerBorder, { borderColor: innerBorderColor }]} />
          <LinearGradient pointerEvents="none" colors={theme.glossStrong} style={styles.glossStrong} start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 0.82 }} />
          <LinearGradient pointerEvents="none" colors={theme.glossSoft} style={styles.glossSoft} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 0.9 }} />

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={valueColor} />
              <Text style={[styles.loadingText, { color: theme.mutedText }]}>Loading</Text>
            </View>
          ) : (
            <View style={styles.content}>
              {editMode ? (
                <View style={styles.editControls}>
                  <Pressable
                    onPress={onPromoteSize}
                    style={({ pressed }) => [
                      styles.editButton,
                      {
                        opacity: pressed ? 0.72 : 1,
                        backgroundColor: iconChipBg,
                        borderColor: iconChipBorder,
                      },
                    ]}
                  >
                    <Expand size={14} color={titleColor} strokeWidth={2.3} />
                  </Pressable>
                  <Pressable
                    onPress={onDemoteSize}
                    style={({ pressed }) => [
                      styles.editButton,
                      {
                        opacity: pressed ? 0.72 : 1,
                        backgroundColor: iconChipBg,
                        borderColor: iconChipBorder,
                      },
                    ]}
                  >
                    <Shrink size={14} color={titleColor} strokeWidth={2.3} />
                  </Pressable>
                </View>
              ) : null}
              {showIcon ? (
                <View style={[styles.iconChip, { backgroundColor: iconChipBg, borderColor: iconChipBorder }]}>
                  <Icon size={21} color={iconColor} strokeWidth={2.35} />
                </View>
              ) : null}

              <View style={styles.copyBlock}>
                {showLabel ? (
                  <Text numberOfLines={2} style={[styles.title, { color: titleColor, fontSize: titleSize }]}>
                    {tile.title}
                  </Text>
                ) : null}
                {showValue ? (
                  <Text numberOfLines={1} style={[styles.value, { color: valueColor, fontSize: valueSize }]}>
                    {tile.value}
                  </Text>
                ) : null}
                {showSelectedQuick ? <ExpandableDetailTile lines={quickLines} theme={theme} /> : null}
                {showExpanded ? <ExpandableDetailTile lines={detailLines} theme={theme} /> : null}
              </View>
            </View>
          )}

          {isDisabled ? <View style={[styles.disabledMask, { backgroundColor: theme.disabledOverlay }]} /> : null}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    borderRadius: 22,
    shadowOffset: { width: 0, height: 3 },
  },
  pressable: {
    width: "100%",
    height: "100%",
  },
  surface: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    borderWidth: 1.1,
    overflow: "hidden",
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
  },
  glossStrong: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "64%",
  },
  glossSoft: {
    position: "absolute",
    top: 10,
    left: 8,
    right: 8,
    height: "48%",
    borderRadius: 16,
  },
  editControls: {
    position: "absolute",
    right: 10,
    top: 10,
    zIndex: 6,
    flexDirection: "row",
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 11,
    justifyContent: "space-between",
  },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    marginTop: 6,
  },
  title: {
    fontWeight: "700",
    lineHeight: 20,
  },
  value: {
    marginTop: 4,
    fontWeight: "700",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
  },
  disabledMask: {
    ...StyleSheet.absoluteFillObject,
  },
});

