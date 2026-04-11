export const IOS_BG = "#F2F2F7";
export const MIDNIGHT_BG = "#1C1C1E";
export const IOS_BLUE = "#007AFF";
export const IOS_RED = "#FF3B30";
export const IOS_GREEN = "#34C759";
export const GLASS_WHITE = "rgba(255, 255, 255, 0.8)";
export const GLASS_DARK = "rgba(44, 44, 46, 0.8)";
export const TEXT_LIGHT = "#111827";
export const TEXT_DARK = "#F5F5F7";
export const TEXT_MUTED_LIGHT = "#6B7280";
export const TEXT_MUTED_DARK = "#8E8E93";

/** Design system: spacing, radius, type, touch targets, shadows */
export const SPACING = {
  pageHorizontal: 20,
  pageTop: 16,
  sectionGap: 24,
  cardPadding: 16,
  cardGap: 12,
  rowGap: 8,
} as const;

export const RADIUS = {
  card: 20,
  button: 12,
  chip: 10,
  input: 12,
} as const;

export const TYPE = {
  pageTitle: 28,
  sectionTitle: 18,
  body: 16,
  secondary: 14,
  helper: 12,
} as const;

export const TOUCH = {
  minHeight: 48,
  minHeightButton: 52,
  fabSize: 56,
} as const;

/** Liquid Glass–style strokes (used by translucent `GlassSurface` panels) */
export const LIQUID = {
  edgeLight: "rgba(255, 255, 255, 0.72)",
  edgeDark: "rgba(255, 255, 255, 0.16)",
  rimLight: "rgba(255, 255, 255, 0.38)",
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export const SHADOW = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  button: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

export function getTheme(isDark: boolean) {
  return {
    bg: isDark ? MIDNIGHT_BG : IOS_BG,
    glass: isDark ? GLASS_DARK : GLASS_WHITE,
    textPrimary: isDark ? TEXT_DARK : TEXT_LIGHT,
    textSecondary: isDark ? TEXT_MUTED_DARK : TEXT_MUTED_LIGHT,
    overlay: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)",
  };
}
