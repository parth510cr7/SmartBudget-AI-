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

export type SpendingPebbleDatum = {
  category: string;
  amount: number;
  detailLine?: string;
  kind?: "category" | "store";
};

type PebbleLayoutItem = {
  datum: SpendingPebbleDatum;
  width: number;
  height: number;
  left: number;
  top: number;
  cx: number;
  cy: number;
  rotation: number;
  radii: [number, number, number, number];
  zIndex: number;
  palette: [string, string, string];
  isStore: boolean;
  labelLines: string[];
  labelFont: number;
  amountFont: number;
};

type PebbleRenderItem = PebbleLayoutItem & {
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

type PebbleTemplate = {
  x: number;
  y: number;
  size: number;
  widthFactor: number;
  heightFactor: number;
  rotation: number;
  radii: [number, number, number, number];
  z: number;
};

type ThemeVisuals = {
  categoryPalettes: Array<[string, string, string]>;
  storePalettes: Array<[string, string, string]>;
  stageGradientColors: [string, string, string];
  stageGlassColor: string;
  stageGlassBorder: string;
  stageGlowColor: string;
  bubbleShadowColor: string;
  bubbleShadowOpacity: number;
  bubbleShadowBoost: number;
  bubbleBorderColor: string;
  bubbleRimColor: string;
  sheenColors: [string, string, string];
  sheenOpacity: number;
  highlightLargeColor: string;
  highlightSmallColor: string;
  textPrimary: string;
  textSecondary: string;
  textShadowColor: string;
  textShadowRadius: number;
  storeOpacity: number;
  detailCardBorder: string;
  detailTitleColor: string;
  detailTextColor: string;
  hintTextColor: string;
  neighborOverlap: number;
  satelliteOpacityScale: number;
  satelliteShadowColor: string;
  satelliteShadowOpacity: number;
  satelliteBorderColor: string;
};

export type SpendingPebbleClusterProps = {
  data: SpendingPebbleDatum[];
  onBubblePress?: (category: SpendingPebbleDatum) => void;
  maxBubbles?: number;
  isDarkMode?: boolean;
  textPrimary?: string;
  textSecondary?: string;
  detailCardBackgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

const LIGHT_CATEGORY_PALETTES: Array<[string, string, string]> = [
  ["rgba(199,238,255,0.86)", "rgba(203,255,242,0.78)", "rgba(214,226,255,0.72)"],
  ["rgba(247,219,255,0.86)", "rgba(210,242,255,0.78)", "rgba(255,224,241,0.72)"],
  ["rgba(255,220,233,0.86)", "rgba(224,238,255,0.78)", "rgba(216,255,237,0.72)"],
  ["rgba(214,242,255,0.86)", "rgba(236,231,255,0.78)", "rgba(255,237,222,0.72)"],
  ["rgba(229,255,236,0.86)", "rgba(219,233,255,0.78)", "rgba(255,229,246,0.72)"],
];

const LIGHT_STORE_PALETTES: Array<[string, string, string]> = [
  ["rgba(217,230,255,0.74)", "rgba(227,241,255,0.68)", "rgba(233,236,255,0.62)"],
  ["rgba(226,224,255,0.74)", "rgba(221,239,255,0.68)", "rgba(236,236,255,0.62)"],
  ["rgba(212,236,255,0.74)", "rgba(227,246,255,0.68)", "rgba(229,235,255,0.62)"],
];

const DARK_CATEGORY_PALETTES: Array<[string, string, string]> = [
  ["rgba(102,212,255,0.72)", "rgba(132,246,226,0.64)", "rgba(159,180,255,0.58)"],
  ["rgba(199,146,255,0.72)", "rgba(255,155,225,0.64)", "rgba(124,198,255,0.58)"],
  ["rgba(255,164,188,0.72)", "rgba(140,218,255,0.64)", "rgba(152,255,209,0.58)"],
  ["rgba(120,234,255,0.72)", "rgba(176,168,255,0.64)", "rgba(255,194,152,0.58)"],
  ["rgba(168,255,207,0.72)", "rgba(146,188,255,0.64)", "rgba(255,170,222,0.58)"],
];

const DARK_STORE_PALETTES: Array<[string, string, string]> = [
  ["rgba(124,164,255,0.6)", "rgba(108,206,255,0.52)", "rgba(170,183,255,0.46)"],
  ["rgba(136,150,255,0.6)", "rgba(120,192,255,0.52)", "rgba(188,176,255,0.46)"],
  ["rgba(103,194,255,0.6)", "rgba(126,224,255,0.52)", "rgba(164,206,255,0.46)"],
];

const SATELLITE_SPECS: Array<{ angle: number; distance: number; size: number; opacity: number; paletteIdx: number }> = [
  { angle: -112, distance: 1.12, size: 9, opacity: 0.3, paletteIdx: 0 },
  { angle: -78, distance: 1.14, size: 7, opacity: 0.24, paletteIdx: 1 },
  { angle: -42, distance: 1.1, size: 8, opacity: 0.28, paletteIdx: 2 },
  { angle: -12, distance: 1.13, size: 6, opacity: 0.22, paletteIdx: 3 },
  { angle: 20, distance: 1.11, size: 9, opacity: 0.29, paletteIdx: 4 },
  { angle: 54, distance: 1.14, size: 7, opacity: 0.23, paletteIdx: 5 },
  { angle: 94, distance: 1.12, size: 9, opacity: 0.3, paletteIdx: 6 },
  { angle: 128, distance: 1.1, size: 7, opacity: 0.24, paletteIdx: 2 },
  { angle: 162, distance: 1.13, size: 8, opacity: 0.27, paletteIdx: 3 },
  { angle: 198, distance: 1.11, size: 6, opacity: 0.21, paletteIdx: 4 },
  { angle: 236, distance: 1.12, size: 8, opacity: 0.26, paletteIdx: 5 },
  { angle: 274, distance: 1.13, size: 7, opacity: 0.23, paletteIdx: 1 },
  { angle: 310, distance: 1.11, size: 8, opacity: 0.27, paletteIdx: 0 },
];

const LAYOUTS: Record<number, PebbleTemplate[]> = {
  1: [{ x: 0.52, y: 0.57, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 }],
  2: [
    { x: 0.54, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.3, y: 0.48, size: 0.8, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
  ],
  3: [
    { x: 0.52, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.3, y: 0.45, size: 0.78, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
    { x: 0.73, y: 0.47, size: 0.74, widthFactor: 1.03, heightFactor: 0.93, rotation: -11, radii: [0.44, 0.46, 0.5, 0.43], z: 7 },
  ],
  4: [
    { x: 0.52, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.31, y: 0.45, size: 0.78, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
    { x: 0.73, y: 0.47, size: 0.74, widthFactor: 1.03, heightFactor: 0.93, rotation: -11, radii: [0.44, 0.46, 0.5, 0.43], z: 7 },
    { x: 0.33, y: 0.7, size: 0.66, widthFactor: 0.98, heightFactor: 0.9, rotation: 11, radii: [0.49, 0.44, 0.46, 0.5], z: 6 },
  ],
  5: [
    { x: 0.52, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.31, y: 0.45, size: 0.78, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
    { x: 0.73, y: 0.47, size: 0.74, widthFactor: 1.03, heightFactor: 0.93, rotation: -11, radii: [0.44, 0.46, 0.5, 0.43], z: 7 },
    { x: 0.33, y: 0.7, size: 0.66, widthFactor: 0.98, heightFactor: 0.9, rotation: 11, radii: [0.49, 0.44, 0.46, 0.5], z: 6 },
    { x: 0.67, y: 0.72, size: 0.62, widthFactor: 0.96, heightFactor: 0.88, rotation: -8, radii: [0.43, 0.5, 0.45, 0.48], z: 5 },
  ],
  6: [
    { x: 0.52, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.31, y: 0.45, size: 0.78, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
    { x: 0.73, y: 0.47, size: 0.74, widthFactor: 1.03, heightFactor: 0.93, rotation: -11, radii: [0.44, 0.46, 0.5, 0.43], z: 7 },
    { x: 0.33, y: 0.7, size: 0.66, widthFactor: 0.98, heightFactor: 0.9, rotation: 11, radii: [0.49, 0.44, 0.46, 0.5], z: 6 },
    { x: 0.67, y: 0.72, size: 0.62, widthFactor: 0.96, heightFactor: 0.88, rotation: -8, radii: [0.43, 0.5, 0.45, 0.48], z: 5 },
    { x: 0.52, y: 0.35, size: 0.58, widthFactor: 1.02, heightFactor: 0.88, rotation: 5, radii: [0.46, 0.44, 0.5, 0.42], z: 4 },
  ],
  7: [
    { x: 0.52, y: 0.58, size: 1, widthFactor: 1.06, heightFactor: 0.94, rotation: -4, radii: [0.47, 0.43, 0.49, 0.44], z: 10 },
    { x: 0.31, y: 0.45, size: 0.78, widthFactor: 1.0, heightFactor: 0.92, rotation: 8, radii: [0.45, 0.5, 0.46, 0.42], z: 8 },
    { x: 0.73, y: 0.47, size: 0.74, widthFactor: 1.03, heightFactor: 0.93, rotation: -11, radii: [0.44, 0.46, 0.5, 0.43], z: 7 },
    { x: 0.33, y: 0.7, size: 0.66, widthFactor: 0.98, heightFactor: 0.9, rotation: 11, radii: [0.49, 0.44, 0.46, 0.5], z: 6 },
    { x: 0.67, y: 0.72, size: 0.62, widthFactor: 0.96, heightFactor: 0.88, rotation: -8, radii: [0.43, 0.5, 0.45, 0.48], z: 5 },
    { x: 0.52, y: 0.35, size: 0.58, widthFactor: 1.02, heightFactor: 0.88, rotation: 5, radii: [0.46, 0.44, 0.5, 0.42], z: 4 },
    { x: 0.2, y: 0.57, size: 0.52, widthFactor: 0.92, heightFactor: 0.86, rotation: -14, radii: [0.44, 0.49, 0.42, 0.47], z: 3 },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function splitIntoBalancedLines(text: string, maxCharsPerLine: number): string[] | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const words = clean.split(" ");
  if (words.length === 1) {
    const word = words[0];
    if (word.length <= maxCharsPerLine) return [word];
    if (word.length <= maxCharsPerLine * 2) {
      const cut = Math.ceil(word.length / 2);
      return [word.slice(0, cut), word.slice(cut)];
    }
    return null;
  }

  let line1 = "";
  let idx = 0;
  const target = Math.ceil(clean.length * 0.56);
  while (idx < words.length) {
    const candidate = line1 ? `${line1} ${words[idx]}` : words[idx];
    if (candidate.length <= maxCharsPerLine && candidate.length <= target + Math.floor(maxCharsPerLine * 0.25)) {
      line1 = candidate;
      idx += 1;
    } else {
      break;
    }
  }
  if (!line1) {
    line1 = words[0];
    idx = 1;
  }
  const line2 = words.slice(idx).join(" ");
  if (!line2) return [line1];
  if (line2.length > maxCharsPerLine) return null;
  return [line1, line2];
}

function fitPebbleLabel(text: string, width: number, height: number, isStore: boolean): { lines: string[]; font: number } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { lines: ["-"], font: 10 };
  const base = clamp(Math.round(Math.min(width, height) * (isStore ? 0.115 : 0.122)), isStore ? 9 : 10, 15);
  const oneLineOnly = isStore || width < 86;

  for (let shrink = 0; shrink <= 3; shrink += 1) {
    const font = base - shrink;
    const maxChars = Math.max(5, Math.floor((width * 0.67) / (font * 0.56)));
    if (oneLineOnly) {
      if (clean.length <= maxChars) return { lines: [clean], font };
      const firstWord = clean.split(" ")[0];
      if (firstWord.length <= maxChars) return { lines: [firstWord], font };
      continue;
    }
    const lines = splitIntoBalancedLines(clean, maxChars);
    if (!lines) continue;
    const neededHeight = lines.length * (font * 1.12);
    if (neededHeight <= height * 0.38 + 6) {
      return { lines, font };
    }
  }

  const minimal = clean.split(" ")[0].slice(0, 10);
  return { lines: [minimal || clean.slice(0, 10)], font: clamp(base - 2, 8, 12) };
}

function getTheme(isDarkMode: boolean, textPrimary?: string, textSecondary?: string): ThemeVisuals {
  if (isDarkMode) {
    return {
      categoryPalettes: DARK_CATEGORY_PALETTES,
      storePalettes: DARK_STORE_PALETTES,
      stageGradientColors: ["rgba(30,35,55,0.28)", "rgba(37,55,90,0.24)", "rgba(57,45,90,0.26)"],
      stageGlassColor: "rgba(21,28,46,0.22)",
      stageGlassBorder: "rgba(190,216,255,0.17)",
      stageGlowColor: "rgba(133,180,255,0.18)",
      bubbleShadowColor: "#78CFFF",
      bubbleShadowOpacity: 0.24,
      bubbleShadowBoost: 0.23,
      bubbleBorderColor: "rgba(229,244,255,0.56)",
      bubbleRimColor: "rgba(214,237,255,0.62)",
      sheenColors: ["rgba(255,255,255,0.86)", "rgba(255,255,255,0.28)", "rgba(255,255,255,0.09)"],
      sheenOpacity: 0.92,
      highlightLargeColor: "rgba(239,247,255,0.66)",
      highlightSmallColor: "rgba(231,244,255,0.52)",
      textPrimary: textPrimary ?? "rgba(250,253,255,0.98)",
      textSecondary: textSecondary ?? "rgba(226,238,255,0.94)",
      textShadowColor: "rgba(2,10,24,0.55)",
      textShadowRadius: 2.1,
      storeOpacity: 0.86,
      detailCardBorder: "rgba(177,210,255,0.3)",
      detailTitleColor: "rgba(246,250,255,0.98)",
      detailTextColor: "rgba(222,234,251,0.92)",
      hintTextColor: "rgba(203,216,242,0.86)",
      neighborOverlap: 0.18,
      satelliteOpacityScale: 1.02,
      satelliteShadowColor: "#84D8FF",
      satelliteShadowOpacity: 0.2,
      satelliteBorderColor: "rgba(209,232,255,0.5)",
    };
  }
  return {
    categoryPalettes: LIGHT_CATEGORY_PALETTES,
    storePalettes: LIGHT_STORE_PALETTES,
    stageGradientColors: ["rgba(182,214,255,0.08)", "rgba(220,242,255,0.05)", "rgba(243,226,255,0.08)"],
    stageGlassColor: "rgba(255,255,255,0.1)",
    stageGlassBorder: "rgba(255,255,255,0.34)",
    stageGlowColor: "rgba(171,215,255,0.12)",
    bubbleShadowColor: "#95D9FF",
    bubbleShadowOpacity: 0.14,
    bubbleShadowBoost: 0.15,
    bubbleBorderColor: "rgba(255,255,255,0.62)",
    bubbleRimColor: "rgba(255,255,255,0.68)",
    sheenColors: ["rgba(255,255,255,0.96)", "rgba(255,255,255,0.36)", "rgba(255,255,255,0.14)"],
    sheenOpacity: 0.8,
    highlightLargeColor: "rgba(255,255,255,0.76)",
    highlightSmallColor: "rgba(255,255,255,0.6)",
    textPrimary: textPrimary ?? "rgba(23,40,64,0.95)",
    textSecondary: textSecondary ?? "rgba(50,72,106,0.9)",
    textShadowColor: "rgba(255,255,255,0)",
    textShadowRadius: 0,
    storeOpacity: 0.88,
    detailCardBorder: "rgba(255,255,255,0.5)",
    detailTitleColor: textPrimary ?? "#111827",
    detailTextColor: textSecondary ?? "#6B7280",
    hintTextColor: textSecondary ?? "#6B7280",
    neighborOverlap: 0.19,
    satelliteOpacityScale: 0.82,
    satelliteShadowColor: "#A4D8FF",
    satelliteShadowOpacity: 0.1,
    satelliteBorderColor: "rgba(255,255,255,0.56)",
  };
}

function buildPebbleLayout(
  input: SpendingPebbleDatum[],
  clusterWidth: number,
  clusterHeight: number,
  maxBubbles: number,
  theme: ThemeVisuals
): PebbleLayoutItem[] {
  const clean = input
    .filter((d) => d && typeof d.category === "string" && d.category.trim() && Number(d.amount) > 0)
    .slice(0, maxBubbles);
  if (clean.length === 0) return [];

  const sorted = [...clean].sort((a, b) => b.amount - a.amount);
  const count = Math.min(sorted.length, 7);
  const width = Math.max(clusterWidth, 320);
  const height = Math.max(clusterHeight, 380);
  const maxAmount = Math.max(...sorted.map((d) => d.amount), 1);
  const templates = LAYOUTS[count] ?? LAYOUTS[7];
  const baseSize = Math.min(width, height) * (count >= 6 ? 0.37 : 0.4);
  const edgePad = 6;

  const placed = sorted.slice(0, count).map((datum, idx) => {
    const template = templates[idx] ?? templates[templates.length - 1];
    const ratio = datum.amount / maxAmount;
    const emphasis = 0.78 + Math.sqrt(ratio) * 0.4;
    const isStore = datum.kind === "store";
    const kindScale = isStore ? 0.78 : 1;
    const raw = baseSize * template.size * emphasis * kindScale;
    const pebbleWidth = clamp(raw * template.widthFactor, isStore ? 58 : 72, isStore ? 118 : 164);
    const pebbleHeight = clamp(raw * template.heightFactor, isStore ? 54 : 66, isStore ? 110 : 152);
    const cx = width * template.x;
    const cy = height * template.y;
    const left = clamp(cx - pebbleWidth / 2, edgePad, width - pebbleWidth - edgePad);
    const top = clamp(cy - pebbleHeight / 2, edgePad, height - pebbleHeight - edgePad);
    const label = fitPebbleLabel(datum.category, pebbleWidth, pebbleHeight, isStore);
    const amountFont = clamp(Math.round(Math.min(pebbleWidth, pebbleHeight) * (isStore ? 0.155 : 0.17)), 11, 18);
    const palettePool = isStore ? theme.storePalettes : theme.categoryPalettes;
    return {
      datum,
      width: pebbleWidth,
      height: pebbleHeight,
      left,
      top,
      cx,
      cy,
      rotation: template.rotation,
      radii: template.radii,
      zIndex: 100 + template.z,
      palette: palettePool[idx % palettePool.length],
      isStore,
      labelLines: label.lines,
      labelFont: label.font,
      amountFont,
    };
  });

  const minX = Math.min(...placed.map((p) => p.left));
  const maxX = Math.max(...placed.map((p) => p.left + p.width));
  const minY = Math.min(...placed.map((p) => p.top));
  const maxY = Math.max(...placed.map((p) => p.top + p.height));
  const boxW = Math.max(maxX - minX, 1);
  const boxH = Math.max(maxY - minY, 1);
  const targetW = count >= 6 ? width * 0.9 : width * 0.82;
  const targetH = count >= 6 ? height * 0.84 : height * 0.74;
  const spreadFactor = clamp(Math.min(targetW / boxW, targetH / boxH), 1, 1.18);
  const centerX = width / 2;
  const centerY = height * 0.56;

  const spread = placed.map((p) => {
    const pcx = p.left + p.width / 2;
    const pcy = p.top + p.height / 2;
    const newCx = centerX + (pcx - centerX) * spreadFactor;
    const newCy = centerY + (pcy - centerY) * spreadFactor;
    const left = clamp(newCx - p.width / 2, edgePad, width - p.width - edgePad);
    const top = clamp(newCy - p.height / 2, edgePad, height - p.height - edgePad);
    return {
      ...p,
      left,
      top,
      cx: left + p.width / 2,
      cy: top + p.height / 2,
    };
  });

  const spreadMinX = Math.min(...spread.map((p) => p.left));
  const spreadMaxX = Math.max(...spread.map((p) => p.left + p.width));
  const spreadMinY = Math.min(...spread.map((p) => p.top));
  const spreadMaxY = Math.max(...spread.map((p) => p.top + p.height));
  const shiftX = width / 2 - (spreadMinX + spreadMaxX) / 2;
  const shiftY = height * 0.56 - (spreadMinY + spreadMaxY) / 2;

  return spread.map((p) => {
    const left = clamp(p.left + shiftX, edgePad, width - p.width - edgePad);
    const top = clamp(p.top + shiftY, edgePad, height - p.height - edgePad);
    return {
      ...p,
      left,
      top,
      cx: left + p.width / 2,
      cy: top + p.height / 2,
    };
  });
}

function buildSatelliteLayout(
  clusterWidth: number,
  clusterHeight: number,
  palettes: Array<[string, string, string]>,
  opacityScale: number
): SatelliteLayoutItem[] {
  const width = Math.max(clusterWidth, 320);
  const height = Math.max(clusterHeight, 380);
  const centerX = width / 2;
  const centerY = height * 0.56;
  const rx = width * 0.36;
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
      opacity: clamp(spec.opacity * opacityScale, 0.1, 0.8),
      palette: palettes[spec.paletteIdx % palettes.length],
    };
  });
}

const SatellitePebble = memo(function SatellitePebble({
  sat,
  index,
  theme,
}: {
  sat: SatelliteLayoutItem;
  index: number;
  theme: ThemeVisuals;
}) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, {
        duration: 3800 + index * 160,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    return () => cancelAnimation(float);
  }, [float, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(float.value, [0, 1], [-1.2, 1.2]) },
      { translateY: interpolate(float.value, [0, 1], [-2.1, 2.1]) },
    ],
    opacity: sat.opacity,
  }));

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
          shadowColor: theme.satelliteShadowColor,
          shadowOpacity: theme.satelliteShadowOpacity,
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
            borderColor: theme.satelliteBorderColor,
          },
        ]}
      />
    </Animated.View>
  );
});

const PebbleItem = memo(function PebbleItem({
  pebble,
  index,
  theme,
  onPress,
}: {
  pebble: PebbleRenderItem;
  index: number;
  theme: ThemeVisuals;
  onPress: (datum: SpendingPebbleDatum) => void;
}) {
  const press = useSharedValue(0);
  const float = useSharedValue(0);
  const shiftX = useSharedValue(pebble.shiftX);
  const shiftY = useSharedValue(pebble.shiftY);
  const selectedFocus = useSharedValue(pebble.isSelected ? 1 : 0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, {
        duration: 3900 + index * 170,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    return () => cancelAnimation(float);
  }, [float, index]);

  useEffect(() => {
    shiftX.value = withTiming(pebble.shiftX, { duration: 260, easing: Easing.out(Easing.cubic) });
    shiftY.value = withTiming(pebble.shiftY, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [pebble.shiftX, pebble.shiftY, shiftX, shiftY]);

  useEffect(() => {
    selectedFocus.value = withTiming(pebble.isSelected ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [pebble.isSelected, selectedFocus]);

  const animatedShell = useAnimatedStyle(() => {
    const bob = 1.8 + (index % 3) * 0.45;
    const drift = 0.9 + (index % 2) * 0.45;
    const translateY = interpolate(float.value, [0, 1], [-bob, bob]) + shiftY.value;
    const translateX = interpolate(float.value, [0, 1], [-drift, drift]) + shiftX.value;
    const liquidTension = press.value * 0.045;
    const scaleX = 1 + selectedFocus.value * 0.05 + press.value * 0.1 + liquidTension;
    const scaleY = 1 + selectedFocus.value * 0.04 + press.value * 0.08 - liquidTension * 0.45;
    const storeShadowFactor = pebble.isStore ? 0.86 : 1;

    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${pebble.rotation}deg` },
        { scaleX },
        { scaleY },
      ],
      zIndex: pebble.zIndex + (selectedFocus.value > 0.01 ? 900 : 0) + (press.value > 0.01 ? 1200 : 0),
      shadowOpacity:
        (theme.bubbleShadowOpacity + selectedFocus.value * 0.12 + press.value * theme.bubbleShadowBoost) *
        storeShadowFactor,
      shadowRadius: (Math.min(pebble.width, pebble.height) * 0.12 + selectedFocus.value * 7 + press.value * 8) * storeShadowFactor,
      elevation: Math.round(Math.min(pebble.width, pebble.height) / 12 + selectedFocus.value * 3 + press.value * 6),
    };
  });

  const splashStyle = useAnimatedStyle(() => ({
    opacity: 0.2 * press.value,
    transform: [{ scale: 1 + press.value * 0.58 }],
  }));

  const cornerRadii = {
    borderTopLeftRadius: Math.min(pebble.width, pebble.height) * pebble.radii[0],
    borderTopRightRadius: Math.min(pebble.width, pebble.height) * pebble.radii[1],
    borderBottomRightRadius: Math.min(pebble.width, pebble.height) * pebble.radii[2],
    borderBottomLeftRadius: Math.min(pebble.width, pebble.height) * pebble.radii[3],
  } as const;

  return (
    <Animated.View
      style={[
        styles.pebbleShell,
        {
          width: pebble.width,
          height: pebble.height,
          left: pebble.left,
          top: pebble.top,
          shadowColor: theme.bubbleShadowColor,
        },
        animatedShell,
      ]}
    >
      <Pressable
        style={styles.pebbleTouchArea}
        onPress={() => onPress(pebble.datum)}
        onPressIn={() => {
          press.value = withSpring(1, { stiffness: 240, damping: 16, mass: 0.62 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { stiffness: 190, damping: 18, mass: 0.7 });
        }}
      >
        <LinearGradient
          colors={pebble.palette}
          start={{ x: 0.08, y: 0.1 }}
          end={{ x: 0.92, y: 0.9 }}
          style={[
            styles.pebbleCore,
            cornerRadii,
            {
              borderColor: pebble.isStore ? "rgba(255,255,255,0.5)" : theme.bubbleBorderColor,
              opacity: pebble.isStore ? theme.storeOpacity : 1,
            },
          ]}
        >
          <View style={[styles.pebbleRim, cornerRadii, { borderColor: pebble.isStore ? "rgba(255,255,255,0.54)" : theme.bubbleRimColor }]} />
          <Animated.View
            style={[
              styles.splashOverlay,
              splashStyle,
              {
                width: pebble.width * 0.84,
                height: pebble.height * 0.82,
                borderRadius: Math.min(pebble.width, pebble.height) * 0.4,
              },
            ]}
          />
          <LinearGradient
            colors={theme.sheenColors}
            start={{ x: 0.03, y: 0.0 }}
            end={{ x: 0.82, y: 0.88 }}
            style={[
              styles.pebbleSheen,
              {
                width: pebble.width * 0.72,
                height: pebble.height * 0.42,
                borderRadius: Math.min(pebble.width, pebble.height) * 0.28,
                opacity: theme.sheenOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.highlightLarge,
              {
                width: Math.min(pebble.width, pebble.height) * 0.16,
                height: Math.min(pebble.width, pebble.height) * 0.16,
                borderRadius: Math.min(pebble.width, pebble.height) * 0.08,
                top: pebble.height * 0.19,
                left: pebble.width * 0.2,
                backgroundColor: theme.highlightLargeColor,
              },
            ]}
          />
          <View
            style={[
              styles.highlightSmall,
              {
                width: Math.min(pebble.width, pebble.height) * 0.075,
                height: Math.min(pebble.width, pebble.height) * 0.075,
                borderRadius: Math.min(pebble.width, pebble.height) * 0.037,
                top: pebble.height * 0.34,
                left: pebble.width * 0.32,
                backgroundColor: theme.highlightSmallColor,
              },
            ]}
          />

          <View style={styles.pebbleContent}>
            {pebble.labelLines.map((line, idx) => (
              <Text
                key={`${line}-${idx}`}
                style={[
                  styles.pebbleLabel,
                  {
                    color: theme.textPrimary,
                    fontSize: pebble.labelFont,
                    textShadowColor: theme.textShadowColor,
                    textShadowRadius: theme.textShadowRadius,
                  },
                ]}
              >
                {line}
              </Text>
            ))}
            <Text
              style={[
                styles.pebbleAmount,
                {
                  color: theme.textSecondary,
                  fontSize: pebble.amountFont,
                  textShadowColor: theme.textShadowColor,
                  textShadowRadius: theme.textShadowRadius * 0.72,
                },
              ]}
            >
              ${pebble.datum.amount.toFixed(0)}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

export function SpendingPebbleCluster({
  data,
  onBubblePress,
  maxBubbles = 7,
  isDarkMode = false,
  textPrimary,
  textSecondary,
  detailCardBackgroundColor = isDarkMode ? "rgba(34,34,38,0.58)" : "rgba(255,255,255,0.82)",
  style,
}: SpendingPebbleClusterProps) {
  const [clusterSize, setClusterSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<SpendingPebbleDatum | null>(null);
  const theme = useMemo(() => getTheme(isDarkMode, textPrimary, textSecondary), [isDarkMode, textPrimary, textSecondary]);
  const satellitePalettePool = useMemo(() => [...theme.categoryPalettes, ...theme.storePalettes], [theme]);

  const layout = useMemo(
    () => buildPebbleLayout(data, clusterSize.width, clusterSize.height, maxBubbles, theme),
    [data, clusterSize.width, clusterSize.height, maxBubbles, theme]
  );

  const satellites = useMemo(
    () => buildSatelliteLayout(clusterSize.width, clusterSize.height, satellitePalettePool, theme.satelliteOpacityScale),
    [clusterSize.width, clusterSize.height, satellitePalettePool, theme]
  );

  const rendered = useMemo<PebbleRenderItem[]>(() => {
    if (layout.length === 0) return [];
    if (!selected) return layout.map((p) => ({ ...p, shiftX: 0, shiftY: 0, isSelected: false }));

    const selectedPebble = layout.find(
      (p) => p.datum.category === selected.category && p.datum.kind === selected.kind && p.datum.amount === selected.amount
    );
    if (!selectedPebble) return layout.map((p) => ({ ...p, shiftX: 0, shiftY: 0, isSelected: false }));

    const influenceRadius = 210;
    return layout.map((p) => {
      const same = p.datum.category === selectedPebble.datum.category && p.datum.kind === selectedPebble.datum.kind && p.datum.amount === selectedPebble.datum.amount;
      if (same) return { ...p, shiftX: 0, shiftY: 0, isSelected: true };
      const dx = p.cx - selectedPebble.cx;
      const dy = p.cy - selectedPebble.cy;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const influence = clamp((influenceRadius - dist) / influenceRadius, 0, 1);
      const spread = 2 + influence * 8;
      return {
        ...p,
        shiftX: (dx / dist) * spread,
        shiftY: (dy / dist) * spread,
        isSelected: false,
      };
    });
  }, [layout, selected]);

  useEffect(() => {
    if (!selected) return;
    const exists = data.some(
      (d) => d.category === selected.category && d.kind === selected.kind && Number(d.amount) === Number(selected.amount)
    );
    if (!exists) setSelected(null);
  }, [data, selected]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setClusterSize((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }
    );
  };

  const onPebblePress = (datum: SpendingPebbleDatum) => {
    setSelected(datum);
    onBubblePress?.(datum);
  };

  if (layout.length === 0) return null;

  return (
    <View style={style}>
      <View style={styles.cluster} onLayout={onLayout}>
        <LinearGradient
          pointerEvents="none"
          colors={theme.stageGradientColors}
          start={{ x: 0.08, y: 0.1 }}
          end={{ x: 0.93, y: 0.9 }}
          style={styles.stageGradient}
        />
        <View
          pointerEvents="none"
          style={[
            styles.stageGlassLayer,
            {
              backgroundColor: theme.stageGlassColor,
              borderColor: theme.stageGlassBorder,
            },
          ]}
        />
        <View pointerEvents="none" style={[styles.stageGlow, { backgroundColor: theme.stageGlowColor }]} />

        {satellites.map((sat, idx) => (
          <SatellitePebble key={`sat-${idx}`} sat={sat} index={idx} theme={theme} />
        ))}
        {rendered.map((pebble, idx) => (
          <PebbleItem key={`${pebble.datum.category}-${idx}`} pebble={pebble} index={idx} theme={theme} onPress={onPebblePress} />
        ))}
      </View>

      {selected ? (
        <View style={[styles.detailCard, { backgroundColor: detailCardBackgroundColor, borderColor: theme.detailCardBorder }]}>
          <Text style={[styles.detailTitle, { color: theme.detailTitleColor }]}>{selected.category}</Text>
          <Text style={[styles.detailText, { color: theme.detailTextColor }]}>
            ${selected.amount.toFixed(2)} {selected.detailLine ?? "spent"}
          </Text>
        </View>
      ) : (
        <Text style={[styles.hintText, { color: theme.hintTextColor }]}>Tap a pebble to view category details.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    marginTop: 14,
    width: "100%",
    minHeight: 406,
    borderRadius: 22,
    overflow: "hidden",
    position: "relative",
  },
  stageGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  stageGlassLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
  },
  stageGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    alignSelf: "center",
    top: 72,
    opacity: 0.9,
  },
  pebbleShell: {
    position: "absolute",
    overflow: "visible",
  },
  pebbleTouchArea: { width: "100%", height: "100%" },
  pebbleCore: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
  },
  pebbleRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.15,
  },
  splashOverlay: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  pebbleSheen: {
    position: "absolute",
    top: "8%",
    left: "8%",
  },
  highlightLarge: { position: "absolute" },
  highlightSmall: { position: "absolute" },
  pebbleContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    maxWidth: "90%",
  },
  pebbleLabel: {
    textAlign: "center",
    fontWeight: "700",
    lineHeight: 16,
    maxWidth: "96%",
  },
  pebbleAmount: {
    marginTop: 2,
    fontWeight: "700",
    textAlign: "center",
  },
  satelliteShell: {
    position: "absolute",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  satelliteCore: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
  },
  detailCard: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  detailText: {
    fontSize: 12,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
});

