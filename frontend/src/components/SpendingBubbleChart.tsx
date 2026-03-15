import { memo, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type SpendingBubbleDatum = {
  category: string;
  amount: number;
  detailLine?: string;
  kind?: "category" | "store";
};

type BubbleLayoutItem = {
  datum: SpendingBubbleDatum;
  size: number;
  left: number;
  top: number;
  zIndex: number;
  showCategoryInside: boolean;
  palette: [string, string, string];
};

type BubbleRenderItem = BubbleLayoutItem & {
  shiftX: number;
  shiftY: number;
  isSelected: boolean;
};

type SatelliteLayoutItem = {
  size: number;
  left: number;
  top: number;
  opacity: number;
  palette: [string, string, string];
};

type BubbleThemeVisuals = {
  categoryPalettes: Array<[string, string, string]>;
  storePalettes: Array<[string, string, string]>;
  layoutOverlapRatio: number;
  stageGradientColors: [string, string, string];
  stageGlassPanelColor: string;
  stageGlassPanelBorderColor: string;
  stageGlowColor: string;
  stageGlowOpacity: number;
  bubbleShadowColor: string;
  bubbleShadowBaseOpacity: number;
  bubbleShadowPressBoost: number;
  bubbleBorderColor: string;
  bubbleRimColor: string;
  splashColor: string;
  sheenColors: [string, string, string];
  sheenOpacity: number;
  highlightLargeColor: string;
  highlightSmallColor: string;
  labelColor: string;
  amountColor: string;
  labelShadowColor: string;
  labelShadowRadius: number;
  storeBubbleOpacity: number;
  satelliteOpacityMultiplier: number;
  satelliteShadowColor: string;
  satelliteShadowOpacity: number;
  satelliteBorderColor: string;
  detailCardBorderColor: string;
};

export type SpendingBubbleChartProps = {
  data: SpendingBubbleDatum[];
  onBubblePress?: (category: SpendingBubbleDatum) => void;
  maxBubbles?: number;
  isDarkMode?: boolean;
  textPrimary?: string;
  textSecondary?: string;
  detailCardBackgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

const LIGHT_CATEGORY_BUBBLE_PALETTES: Array<[string, string, string]> = [
  ["rgba(255,210,230,0.84)", "rgba(196,238,255,0.78)", "rgba(204,255,236,0.7)"],
  ["rgba(225,214,255,0.84)", "rgba(255,220,241,0.76)", "rgba(192,236,255,0.7)"],
  ["rgba(255,233,204,0.84)", "rgba(209,241,255,0.76)", "rgba(227,255,224,0.7)"],
  ["rgba(224,250,255,0.84)", "rgba(255,219,238,0.77)", "rgba(221,228,255,0.7)"],
  ["rgba(240,224,255,0.84)", "rgba(209,255,244,0.75)", "rgba(255,238,224,0.7)"],
  ["rgba(255,216,216,0.84)", "rgba(216,234,255,0.77)", "rgba(218,255,233,0.7)"],
];

const LIGHT_STORE_BUBBLE_PALETTES: Array<[string, string, string]> = [
  ["rgba(202,224,255,0.72)", "rgba(214,238,255,0.66)", "rgba(233,240,255,0.6)"],
  ["rgba(220,218,255,0.72)", "rgba(207,233,255,0.66)", "rgba(235,238,255,0.6)"],
  ["rgba(213,232,255,0.72)", "rgba(229,240,255,0.66)", "rgba(219,249,255,0.6)"],
];

const DARK_CATEGORY_BUBBLE_PALETTES: Array<[string, string, string]> = [
  ["rgba(255,138,198,0.68)", "rgba(96,203,255,0.62)", "rgba(116,242,208,0.56)"],
  ["rgba(164,143,255,0.68)", "rgba(255,136,214,0.6)", "rgba(114,194,255,0.56)"],
  ["rgba(255,184,110,0.68)", "rgba(112,210,255,0.61)", "rgba(162,240,158,0.56)"],
  ["rgba(101,236,255,0.68)", "rgba(255,145,207,0.61)", "rgba(138,164,255,0.56)"],
  ["rgba(194,146,255,0.68)", "rgba(102,248,216,0.59)", "rgba(255,188,146,0.56)"],
  ["rgba(255,148,148,0.68)", "rgba(134,189,255,0.61)", "rgba(138,246,176,0.56)"],
];

const DARK_STORE_BUBBLE_PALETTES: Array<[string, string, string]> = [
  ["rgba(121,160,255,0.56)", "rgba(87,198,255,0.48)", "rgba(154,178,255,0.42)"],
  ["rgba(130,144,255,0.56)", "rgba(112,184,255,0.48)", "rgba(176,170,255,0.42)"],
  ["rgba(98,186,255,0.56)", "rgba(112,220,255,0.48)", "rgba(153,198,255,0.42)"],
];

const SATELLITE_SPECS: Array<{ angle: number; distance: number; size: number; opacity: number; paletteIdx: number }> = [
  { angle: -108, distance: 1.12, size: 11, opacity: 0.38, paletteIdx: 0 },
  { angle: -86, distance: 1.14, size: 7, opacity: 0.28, paletteIdx: 1 },
  { angle: -58, distance: 1.1, size: 9, opacity: 0.33, paletteIdx: 2 },
  { angle: -28, distance: 1.13, size: 7, opacity: 0.27, paletteIdx: 4 },
  { angle: -4, distance: 1.12, size: 10, opacity: 0.35, paletteIdx: 5 },
  { angle: 26, distance: 1.14, size: 8, opacity: 0.29, paletteIdx: 3 },
  { angle: 58, distance: 1.11, size: 10, opacity: 0.34, paletteIdx: 1 },
  { angle: 88, distance: 1.14, size: 7, opacity: 0.26, paletteIdx: 0 },
  { angle: 116, distance: 1.12, size: 11, opacity: 0.37, paletteIdx: 2 },
  { angle: 148, distance: 1.1, size: 8, opacity: 0.29, paletteIdx: 4 },
  { angle: 182, distance: 1.13, size: 10, opacity: 0.33, paletteIdx: 5 },
  { angle: 214, distance: 1.12, size: 7, opacity: 0.26, paletteIdx: 3 },
  { angle: 246, distance: 1.1, size: 10, opacity: 0.34, paletteIdx: 1 },
  { angle: 278, distance: 1.13, size: 8, opacity: 0.28, paletteIdx: 0 },
  { angle: 312, distance: 1.11, size: 9, opacity: 0.31, paletteIdx: 2 },
];

function getThemeVisuals(isDarkMode: boolean): BubbleThemeVisuals {
  if (isDarkMode) {
    return {
      categoryPalettes: DARK_CATEGORY_BUBBLE_PALETTES,
      storePalettes: DARK_STORE_BUBBLE_PALETTES,
      layoutOverlapRatio: 0.16,
      stageGradientColors: ["rgba(28,33,55,0.28)", "rgba(34,55,92,0.26)", "rgba(56,43,90,0.3)"],
      stageGlassPanelColor: "rgba(19,27,46,0.32)",
      stageGlassPanelBorderColor: "rgba(194,218,255,0.18)",
      stageGlowColor: "rgba(137,181,255,0.2)",
      stageGlowOpacity: 1,
      bubbleShadowColor: "#73CEFF",
      bubbleShadowBaseOpacity: 0.26,
      bubbleShadowPressBoost: 0.22,
      bubbleBorderColor: "rgba(228,243,255,0.56)",
      bubbleRimColor: "rgba(214,236,255,0.62)",
      splashColor: "rgba(199,232,255,0.34)",
      sheenColors: ["rgba(255,255,255,0.84)", "rgba(255,255,255,0.26)", "rgba(255,255,255,0.08)"],
      sheenOpacity: 0.94,
      highlightLargeColor: "rgba(239,247,255,0.64)",
      highlightSmallColor: "rgba(232,244,255,0.5)",
      labelColor: "rgba(251,254,255,1)",
      amountColor: "rgba(232,242,255,0.96)",
      labelShadowColor: "rgba(2,10,24,0.58)",
      labelShadowRadius: 2.2,
      storeBubbleOpacity: 0.88,
      satelliteOpacityMultiplier: 1.06,
      satelliteShadowColor: "#82D8FF",
      satelliteShadowOpacity: 0.22,
      satelliteBorderColor: "rgba(209,232,255,0.52)",
      detailCardBorderColor: "rgba(173,210,255,0.3)",
    };
  }

  return {
    categoryPalettes: LIGHT_CATEGORY_BUBBLE_PALETTES,
    storePalettes: LIGHT_STORE_BUBBLE_PALETTES,
    layoutOverlapRatio: 0.17,
    stageGradientColors: ["rgba(181,212,255,0.09)", "rgba(219,241,255,0.06)", "rgba(241,223,255,0.09)"],
    stageGlassPanelColor: "rgba(255,255,255,0.1)",
    stageGlassPanelBorderColor: "rgba(255,255,255,0.34)",
    stageGlowColor: "rgba(174,216,255,0.12)",
    stageGlowOpacity: 0.85,
    bubbleShadowColor: "#94D8FF",
    bubbleShadowBaseOpacity: 0.14,
    bubbleShadowPressBoost: 0.14,
    bubbleBorderColor: "rgba(255,255,255,0.6)",
    bubbleRimColor: "rgba(255,255,255,0.66)",
    splashColor: "rgba(255,255,255,0.24)",
    sheenColors: ["rgba(255,255,255,0.94)", "rgba(255,255,255,0.34)", "rgba(255,255,255,0.12)"],
    sheenOpacity: 0.8,
    highlightLargeColor: "rgba(255,255,255,0.74)",
    highlightSmallColor: "rgba(255,255,255,0.58)",
    labelColor: "rgba(22,38,62,0.95)",
    amountColor: "rgba(50,72,106,0.88)",
    labelShadowColor: "rgba(255,255,255,0)",
    labelShadowRadius: 0,
    storeBubbleOpacity: 0.88,
    satelliteOpacityMultiplier: 0.84,
    satelliteShadowColor: "#A4D8FF",
    satelliteShadowOpacity: 0.1,
    satelliteBorderColor: "rgba(255,255,255,0.56)",
    detailCardBorderColor: "rgba(255,255,255,0.5)",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function canSingleLineFit(name: string, bubbleSize: number, fontSize: number): boolean {
  const estimatedWidth = name.length * fontSize * 0.56;
  return estimatedWidth <= bubbleSize * 0.74;
}

function buildLayout(
  input: SpendingBubbleDatum[],
  clusterWidth: number,
  clusterHeight: number,
  maxBubbles: number,
  visuals: BubbleThemeVisuals
): BubbleLayoutItem[] {
  const clean = input
    .filter((d) => d && typeof d.category === "string" && d.category.trim() && Number(d.amount) > 0)
    .slice(0, maxBubbles);
  if (clean.length === 0) return [];

  const count = clean.length;
  const width = Math.max(clusterWidth, 330);
  const height = Math.max(clusterHeight, 350);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxAmount = Math.max(...clean.map((d) => d.amount), 1);
  const gap = count >= 8 ? 11 : count >= 7 ? 10 : count >= 6 ? 9 : 8;
  const overlapCap = count >= 8 ? 0.2 : count >= 6 ? 0.18 : 0.22;
  const overlap = clamp(Math.min(visuals.layoutOverlapRatio, overlapCap), 0.08, 0.28);
  const sizeMin = count >= 8 ? 62 : count >= 7 ? 66 : count >= 6 ? 76 : 84;
  const sizeMax = count >= 8 ? 106 : count >= 7 ? 114 : count >= 6 ? 126 : 136;
  const edgePadding = count >= 8 ? 6 : 4;

  const sized = clean.map((datum, idx) => {
    // sqrt scaling keeps smallest bubbles readable while preserving visual contrast
    const ratio = datum.amount / maxAmount;
    const rawSize = clamp(sizeMin + Math.sqrt(ratio) * (sizeMax - sizeMin), sizeMin, sizeMax);
    const isStore = datum.kind === "store";
    const size = clamp(rawSize * (isStore ? 0.86 : 1), sizeMin * 0.8, sizeMax);
    const palettePool = isStore ? visuals.storePalettes : visuals.categoryPalettes;
    return {
      datum,
      size,
      amount: datum.amount,
      palette: palettePool[idx % palettePool.length],
    };
  });

  const sorted = [...sized].sort((a, b) => b.amount - a.amount);
  const placed: Array<
    (typeof sorted)[number] & {
      cx: number;
      cy: number;
      r: number;
      rank: number;
      showCategoryInside: boolean;
    }
  > = [];
  const seedAngles = [-90, -45, 0, 45, 90, 135, 180, 225, 270, 315, -20, 20, 70, 110, 160, 200, 250, 290, 340];

  sorted.forEach((bubble, rank) => {
    const r = bubble.size / 2;
    let cx = centerX;
    let cy = centerY;
    let found = false;

    if (rank === 0) {
      found = true;
    } else {
      const anchorRadius =
        (placed[0]?.r ?? 52) +
        r +
        gap -
        Math.min(placed[0]?.r ?? 52, r) * overlap;
      for (let ring = 0; ring < (count >= 8 ? 7 : 6) && !found; ring++) {
        const radial = anchorRadius + ring * (count >= 8 ? 18 + r * 0.28 : 16 + r * 0.32);
        for (let a = 0; a < seedAngles.length && !found; a++) {
          const deg = seedAngles[(a + rank) % seedAngles.length];
          const rad = (deg * Math.PI) / 180;
          const tx = centerX + Math.cos(rad) * radial;
          const ty = centerY + Math.sin(rad) * radial * (count >= 8 ? 0.88 : 0.86);
          const inBounds =
            tx - r >= edgePadding &&
            tx + r <= width - edgePadding &&
            ty - r >= edgePadding &&
            ty + r <= height - edgePadding;
          if (!inBounds) continue;
          const collides = placed.some((p) => {
            const dist = Math.hypot(tx - p.cx, ty - p.cy);
            const minDist = p.r + r - Math.min(p.r, r) * overlap;
            return dist < minDist;
          });
          if (!collides) {
            cx = tx;
            cy = ty;
            found = true;
          }
        }
      }
    }

    if (!found) {
      cx = clamp(centerX + (rank % 2 === 0 ? -1 : 1) * (r + 14), r + edgePadding, width - r - edgePadding);
      cy = clamp(centerY + (rank - 2) * (r * 0.46), r + edgePadding, height - r - edgePadding);
    }

    const labelSize = bubble.size >= 126 ? 14 : bubble.size >= 110 ? 13 : 12;
    const showCategoryInside = canSingleLineFit(bubble.datum.category, bubble.size, labelSize);

    placed.push({
      ...bubble,
      cx,
      cy,
      r,
      rank,
      showCategoryInside,
    });
  });

  // Expand cluster to better use tile space while preserving the same organic shape.
  const minX = Math.min(...placed.map((p) => p.cx - p.r));
  const maxX = Math.max(...placed.map((p) => p.cx + p.r));
  const minY = Math.min(...placed.map((p) => p.cy - p.r));
  const maxY = Math.max(...placed.map((p) => p.cy + p.r));
  const boxWidth = Math.max(maxX - minX, 1);
  const boxHeight = Math.max(maxY - minY, 1);
  const targetWidth = count >= 8 ? width * 0.92 : count >= 7 ? width * 0.9 : count >= 6 ? width * 0.84 : width * 0.74;
  const targetHeight = count >= 8 ? height * 0.86 : count >= 7 ? height * 0.84 : count >= 6 ? height * 0.78 : height * 0.68;
  const expandFactor = clamp(Math.min(targetWidth / boxWidth, targetHeight / boxHeight), 1, 1.24);
  const expanded =
    expandFactor > 1.01
      ? placed.map((p) => ({
          ...p,
          cx: centerX + (p.cx - centerX) * expandFactor,
          cy: centerY + (p.cy - centerY) * expandFactor,
        }))
      : placed;

  // recenter occupied area so cluster stays visually centered
  const minX2 = Math.min(...expanded.map((p) => p.cx - p.r));
  const maxX2 = Math.max(...expanded.map((p) => p.cx + p.r));
  const minY2 = Math.min(...expanded.map((p) => p.cy - p.r));
  const maxY2 = Math.max(...expanded.map((p) => p.cy + p.r));
  const clusterCenterX = (minX2 + maxX2) / 2;
  const clusterCenterY = (minY2 + maxY2) / 2;
  const shiftX = centerX - clusterCenterX;
  const shiftY = centerY - clusterCenterY;

  return expanded.map((p) => {
    const cx = clamp(p.cx + shiftX, p.r + edgePadding, width - p.r - edgePadding);
    const cy = clamp(p.cy + shiftY, p.r + edgePadding, height - p.r - edgePadding);
    return {
      datum: p.datum,
      size: p.size,
      left: cx - p.r,
      top: cy - p.r,
      zIndex: 100 + (10 - p.rank),
      showCategoryInside: p.showCategoryInside,
      palette: p.palette,
    };
  });
}

function buildSatelliteLayout(
  clusterWidth: number,
  clusterHeight: number,
  palettes: Array<[string, string, string]>,
  opacityMultiplier: number
): SatelliteLayoutItem[] {
  const width = Math.max(clusterWidth, 300);
  const height = Math.max(clusterHeight, 300);
  const centerX = width / 2;
  const centerY = height / 2;
  const rx = width * 0.31;
  const ry = height * 0.31;

  return SATELLITE_SPECS.map((spec) => {
    const rad = (spec.angle * Math.PI) / 180;
    const cx = centerX + Math.cos(rad) * rx * spec.distance;
    const cy = centerY + Math.sin(rad) * ry * spec.distance;
    const size = spec.size;
    return {
      size,
      left: clamp(cx - size / 2, 2, width - size - 2),
      top: clamp(cy - size / 2, 2, height - size - 2),
      opacity: clamp(spec.opacity * opacityMultiplier, 0.12, 0.86),
      palette: palettes[spec.paletteIdx % palettes.length],
    };
  });
}

const SatelliteBubble = memo(function SatelliteBubble({
  sat,
  index,
  visuals,
}: {
  sat: SatelliteLayoutItem;
  index: number;
  visuals: BubbleThemeVisuals;
}) {
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, {
        duration: 3300 + index * 190,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    return () => cancelAnimation(float);
  }, [float, index]);

  const animatedStyle = useAnimatedStyle(() => {
    const bob = 2 + (index % 3);
    const drift = 1 + (index % 2);
    return {
      transform: [
        { translateY: interpolate(float.value, [0, 1], [-bob, bob]) },
        { translateX: interpolate(float.value, [0, 1], [-drift, drift]) },
      ],
      opacity: sat.opacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.satelliteShell,
        {
          width: sat.size,
          height: sat.size,
          borderRadius: sat.size / 2,
          left: sat.left,
          top: sat.top,
          shadowColor: visuals.satelliteShadowColor,
          shadowOpacity: visuals.satelliteShadowOpacity,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={sat.palette}
        start={{ x: 0.15, y: 0.15 }}
        end={{ x: 0.9, y: 0.9 }}
        style={[
          styles.satelliteCore,
          {
            borderRadius: sat.size / 2,
            borderColor: visuals.satelliteBorderColor,
          },
        ]}
      >
        <View
          style={[
            styles.satelliteRim,
            {
              borderRadius: sat.size / 2,
              borderColor: visuals.satelliteBorderColor,
            },
          ]}
        />
      </LinearGradient>
    </Animated.View>
  );
});

const BubbleItem = memo(function BubbleItem({
  bubble,
  index,
  visuals,
  onPress,
}: {
  bubble: BubbleRenderItem;
  index: number;
  visuals: BubbleThemeVisuals;
  onPress: (datum: SpendingBubbleDatum) => void;
}) {
  const isStore = bubble.datum.kind === "store";
  const press = useSharedValue(0);
  const float = useSharedValue(0);
  const shiftX = useSharedValue(bubble.shiftX);
  const shiftY = useSharedValue(bubble.shiftY);
  const selectedFocus = useSharedValue(bubble.isSelected ? 1 : 0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, {
        duration: 3600 + index * 220,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    return () => cancelAnimation(float);
  }, [float, index]);

  useEffect(() => {
    shiftX.value = withTiming(bubble.shiftX, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    shiftY.value = withTiming(bubble.shiftY, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [bubble.shiftX, bubble.shiftY, shiftX, shiftY]);

  useEffect(() => {
    selectedFocus.value = withTiming(bubble.isSelected ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [bubble.isSelected, selectedFocus]);

  const animatedShell = useAnimatedStyle(() => {
    const bob = 2.1 + (index % 3) * 0.6;
    const drift = 1.1 + (index % 2) * 0.55;
    const translateY = interpolate(float.value, [0, 1], [-bob, bob]) + shiftY.value;
    const translateX = interpolate(float.value, [0, 1], [-drift, drift]) + shiftX.value;
    const scale = 1 + selectedFocus.value * 0.06 + press.value * 0.14;
    const storeShadowFactor = isStore ? 0.88 : 1;
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      zIndex:
        bubble.zIndex +
        (selectedFocus.value > 0.01 ? 900 : 0) +
        (press.value > 0.01 ? 1200 : 0),
      shadowOpacity:
        (visuals.bubbleShadowBaseOpacity +
          selectedFocus.value * 0.1 +
          press.value * visuals.bubbleShadowPressBoost) *
        storeShadowFactor,
      shadowRadius: (bubble.size * 0.1 + selectedFocus.value * 6 + press.value * 7) * storeShadowFactor,
      elevation: Math.round(bubble.size / 11 + selectedFocus.value * 3 + press.value * 6),
    };
  });

  const splashStyle = useAnimatedStyle(() => ({
    opacity: 0.2 * press.value,
    transform: [{ scale: 1 + press.value * 0.65 }],
  }));

  const labelFontSize = clamp(Math.round(bubble.size * 0.12 * (isStore ? 0.94 : 1)), 10, 15);
  const amountFontSize = clamp(Math.round(bubble.size * 0.145 * (isStore ? 0.94 : 1)), 11, 16);

  return (
    <Animated.View
      style={[
        styles.bubbleShell,
        {
          width: bubble.size,
          height: bubble.size,
          borderRadius: bubble.size / 2,
          left: bubble.left,
          top: bubble.top,
          shadowColor: visuals.bubbleShadowColor,
        },
        animatedShell,
      ]}
    >
      <Pressable
        style={styles.bubbleTouchArea}
        onPress={() => onPress(bubble.datum)}
        onPressIn={() => {
          press.value = withSpring(1, { stiffness: 220, damping: 14, mass: 0.62 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { stiffness: 180, damping: 16, mass: 0.68 });
        }}
      >
        <LinearGradient
          colors={bubble.palette}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={[
            styles.bubbleCore,
            {
              borderRadius: bubble.size / 2,
              borderColor: isStore ? "rgba(255,255,255,0.5)" : visuals.bubbleBorderColor,
              opacity: isStore ? visuals.storeBubbleOpacity : 1,
            },
          ]}
        >
          <View
            style={[
              styles.bubbleRim,
              {
                borderRadius: bubble.size / 2,
                borderColor: isStore ? "rgba(255,255,255,0.54)" : visuals.bubbleRimColor,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.splashOverlay,
              splashStyle,
              {
                width: bubble.size * 0.86,
                height: bubble.size * 0.86,
                borderRadius: bubble.size * 0.43,
                backgroundColor: visuals.splashColor,
              },
            ]}
          />
          <LinearGradient
            colors={visuals.sheenColors}
            start={{ x: 0.05, y: 0.0 }}
            end={{ x: 0.85, y: 0.9 }}
            style={[
              styles.bubbleSheen,
              {
                width: bubble.size * 0.72,
                height: bubble.size * 0.45,
                borderRadius: bubble.size * 0.24,
                opacity: visuals.sheenOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.bubbleHighlightLarge,
              {
                width: bubble.size * 0.17,
                height: bubble.size * 0.17,
                borderRadius: bubble.size * 0.085,
                top: bubble.size * 0.18,
                left: bubble.size * 0.2,
                backgroundColor: visuals.highlightLargeColor,
              },
            ]}
          />
          <View
            style={[
              styles.bubbleHighlightSmall,
              {
                width: bubble.size * 0.08,
                height: bubble.size * 0.08,
                borderRadius: bubble.size * 0.04,
                top: bubble.size * 0.34,
                left: bubble.size * 0.3,
                backgroundColor: visuals.highlightSmallColor,
              },
            ]}
          />
          <View style={styles.bubbleContent}>
            {bubble.showCategoryInside ? (
              <Text
                style={[
                  styles.bubbleLabel,
                  {
                    color: visuals.labelColor,
                    fontSize: labelFontSize,
                    textShadowColor: visuals.labelShadowColor,
                    textShadowRadius: visuals.labelShadowRadius,
                  },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {bubble.datum.category}
              </Text>
            ) : (
              <Text
                style={[
                  styles.bubbleLabel,
                  {
                    color: visuals.labelColor,
                    fontSize: clamp(labelFontSize - 1, 10, 14),
                    textShadowColor: visuals.labelShadowColor,
                    textShadowRadius: visuals.labelShadowRadius,
                  },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {bubble.datum.category}
              </Text>
            )}
            <Text
              style={[
                styles.bubbleAmount,
                {
                  color: visuals.amountColor,
                  fontSize: amountFontSize,
                  textShadowColor: visuals.labelShadowColor,
                  textShadowRadius: visuals.labelShadowRadius * 0.75,
                },
              ]}
            >
              ${bubble.datum.amount.toFixed(0)}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

export function SpendingBubbleChart({
  data,
  onBubblePress,
  maxBubbles = 6,
  isDarkMode = false,
  textPrimary = isDarkMode ? "#F5F5F7" : "#111827",
  textSecondary = isDarkMode ? "#C9D1E6" : "#6B7280",
  detailCardBackgroundColor = isDarkMode ? "rgba(44,44,46,0.6)" : "rgba(255,255,255,0.8)",
  style,
}: SpendingBubbleChartProps) {
  const [clusterSize, setClusterSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<SpendingBubbleDatum | null>(null);
  const visuals = useMemo(() => getThemeVisuals(isDarkMode), [isDarkMode]);
  const detailTitleColor = isDarkMode ? "rgba(246,250,255,0.98)" : textPrimary;
  const detailMetaColor = isDarkMode ? "rgba(223,233,251,0.9)" : textSecondary;
  const hintColor = isDarkMode ? "rgba(205,216,244,0.88)" : textSecondary;
  const satellitePalettes = useMemo(
    () => [...visuals.categoryPalettes, ...visuals.storePalettes],
    [visuals]
  );

  const layout = useMemo(
    () =>
      buildLayout(
        data,
        clusterSize.width,
        clusterSize.height,
        maxBubbles,
        visuals
      ),
    [data, clusterSize.width, clusterSize.height, maxBubbles, visuals]
  );
  const satellites = useMemo(
    () =>
      buildSatelliteLayout(
        clusterSize.width,
        clusterSize.height,
        satellitePalettes,
        visuals.satelliteOpacityMultiplier
      ),
    [clusterSize.width, clusterSize.height, satellitePalettes, visuals]
  );
  const renderedLayout = useMemo<BubbleRenderItem[]>(() => {
    if (layout.length === 0) return [];
    if (!selected) {
      return layout.map((bubble) => ({
        ...bubble,
        shiftX: 0,
        shiftY: 0,
        isSelected: false,
      }));
    }

    const selectedBubble = layout.find((bubble) => bubble.datum.category === selected.category);
    if (!selectedBubble) {
      return layout.map((bubble) => ({
        ...bubble,
        shiftX: 0,
        shiftY: 0,
        isSelected: false,
      }));
    }

    const selectedCx = selectedBubble.left + selectedBubble.size / 2;
    const selectedCy = selectedBubble.top + selectedBubble.size / 2;
    const influenceRadius = 230;

    return layout.map((bubble) => {
      const isSelected = bubble.datum.category === selected.category;
      if (isSelected) {
        return {
          ...bubble,
          shiftX: 0,
          shiftY: 0,
          isSelected: true,
        };
      }

      const cx = bubble.left + bubble.size / 2;
      const cy = bubble.top + bubble.size / 2;
      const dx = cx - selectedCx;
      const dy = cy - selectedCy;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const influence = clamp((influenceRadius - distance) / influenceRadius, 0, 1);
      const spread = 2 + influence * 9;

      return {
        ...bubble,
        shiftX: (dx / distance) * spread,
        shiftY: (dy / distance) * spread,
        isSelected: false,
      };
    });
  }, [layout, selected]);

  useEffect(() => {
    if (!selected) return;
    const exists = data.some((d) => d.category === selected.category);
    if (!exists) setSelected(null);
  }, [data, selected]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setClusterSize((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    );
  };

  const handleBubblePress = (datum: SpendingBubbleDatum) => {
    setSelected(datum);
    onBubblePress?.(datum);
  };

  if (layout.length === 0) return null;

  return (
    <View style={style}>
      <View style={styles.cluster} onLayout={handleLayout}>
        <LinearGradient
          pointerEvents="none"
          colors={visuals.stageGradientColors}
          start={{ x: 0.06, y: 0.1 }}
          end={{ x: 0.95, y: 0.92 }}
          style={styles.stageBaseGradient}
        />
        <View
          pointerEvents="none"
          style={[
            styles.stageGlassPanel,
            {
              backgroundColor: visuals.stageGlassPanelColor,
              borderColor: visuals.stageGlassPanelBorderColor,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.stageAmbientGlow,
            {
              backgroundColor: visuals.stageGlowColor,
              opacity: visuals.stageGlowOpacity,
            },
          ]}
        />
        {satellites.map((sat, idx) => (
          <SatelliteBubble key={`sat-${idx}`} sat={sat} index={idx} visuals={visuals} />
        ))}
        {renderedLayout.map((bubble, idx) => (
          <BubbleItem
            key={`${bubble.datum.category}-${idx}`}
            bubble={bubble}
            index={idx}
            visuals={visuals}
            onPress={handleBubblePress}
          />
        ))}
      </View>
      {selected ? (
        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: detailCardBackgroundColor,
              borderColor: visuals.detailCardBorderColor,
            },
          ]}
        >
          <Text style={[styles.detailTitle, { color: detailTitleColor }]}>{selected.category}</Text>
          <Text style={[styles.detailText, { color: detailMetaColor }]}>
            ${selected.amount.toFixed(2)} {selected.detailLine ?? "spent"}
          </Text>
        </View>
      ) : (
        <Text style={[styles.hintText, { color: hintColor }]}>Tap a bubble to view category details.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    marginTop: 14,
    width: "100%",
    alignSelf: "center",
    minHeight: 400,
    position: "relative",
    borderRadius: 20,
    overflow: "hidden",
  },
  stageBaseGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  stageGlassPanel: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },
  stageAmbientGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    top: 64,
    alignSelf: "center",
  },
  detailCard: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  detailTitle: { fontSize: 14, fontWeight: "700" },
  detailText: { fontSize: 12, marginTop: 2 },
  hintText: { fontSize: 12, marginTop: 10, textAlign: "center" },
  bubbleShell: {
    shadowColor: "#60C8FF",
    overflow: "visible",
    position: "absolute",
  },
  satelliteShell: {
    position: "absolute",
    overflow: "hidden",
    shadowColor: "#96DDFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  satelliteCore: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  satelliteRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  bubbleTouchArea: { width: "100%", height: "100%" },
  bubbleCore: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  bubbleRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  splashOverlay: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bubbleSheen: {
    position: "absolute",
    top: "8%",
    left: "8%",
    opacity: 0.72,
  },
  bubbleHighlightLarge: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  bubbleHighlightSmall: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  bubbleContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: "92%",
  },
  bubbleLabel: { fontSize: 12, fontWeight: "700", textAlign: "center", maxWidth: "90%" },
  bubbleAmount: { fontSize: 11, marginTop: 2, fontWeight: "600" },
});

