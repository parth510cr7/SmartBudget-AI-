export type GlassTheme = {
  boardBackground: string;
  boardBorder: string;
  boardInnerBorder: string;
  boardGlow: [string, string, string];
  helperText: string;
  cardBorder: string;
  cardInnerBorder: string;
  cardShadow: string;
  cardShadowOpacity: number;
  cardElevation: number;
  cardPaletteCategory: Array<[string, string, string]>;
  cardPaletteStore: Array<[string, string, string]>;
  cardPaletteSummary: Array<[string, string, string]>;
  selectedPalette: [string, string, string];
  adjustedPalette: [string, string, string];
  selectedBorder: string;
  adjustedBorder: string;
  iconChipBackground: string;
  iconChipBorder: string;
  iconChipBackgroundSelected: string;
  iconChipBorderSelected: string;
  iconChipBackgroundAdjusted: string;
  iconChipBorderAdjusted: string;
  iconColorDefault: string;
  iconColorMuted: string;
  iconColorSelected: string;
  glossStrong: [string, string, string];
  glossSoft: [string, string, string];
  titleText: string;
  valueText: string;
  mutedText: string;
  selectedTitleText: string;
  selectedValueText: string;
  adjustedTitleText: string;
  adjustedValueText: string;
  disabledOverlay: string;
  detailBackground: string;
  detailBorder: string;
  detailTitle: string;
  detailValue: string;
  detailMeta: string;
};

export function getGlassTheme(isDarkMode: boolean, textPrimary?: string, textSecondary?: string): GlassTheme {
  if (isDarkMode) {
    return {
      boardBackground: "rgba(30,35,45,0.95)",
      boardBorder: "rgba(255,255,255,0.08)",
      boardInnerBorder: "rgba(255,255,255,0.06)",
      boardGlow: ["rgba(115,154,230,0.2)", "rgba(74,102,156,0.1)", "rgba(39,47,61,0)"],
      helperText: "rgba(200,214,240,0.86)",
      cardBorder: "rgba(255,255,255,0.16)",
      cardInnerBorder: "rgba(255,255,255,0.1)",
      cardShadow: "#02060E",
      cardShadowOpacity: 0.3,
      cardElevation: 5,
      cardPaletteCategory: [
        ["rgba(82,92,114,0.97)", "rgba(64,74,95,0.97)", "rgba(48,58,78,0.97)"],
        ["rgba(84,94,116,0.97)", "rgba(65,75,96,0.97)", "rgba(50,59,80,0.97)"],
        ["rgba(79,90,111,0.97)", "rgba(62,72,93,0.97)", "rgba(46,57,76,0.97)"],
      ],
      cardPaletteStore: [
        ["rgba(67,85,122,0.97)", "rgba(55,73,107,0.97)", "rgba(42,60,91,0.97)"],
        ["rgba(69,87,124,0.97)", "rgba(56,74,109,0.97)", "rgba(43,61,93,0.97)"],
      ],
      cardPaletteSummary: [
        ["rgba(77,89,113,0.97)", "rgba(59,71,95,0.97)", "rgba(45,56,78,0.97)"],
        ["rgba(81,94,118,0.97)", "rgba(62,75,99,0.97)", "rgba(47,59,82,0.97)"],
      ],
      selectedPalette: ["rgba(94,122,177,0.98)", "rgba(69,96,150,0.98)", "rgba(50,74,124,0.98)"],
      adjustedPalette: ["rgba(255,164,76,0.97)", "rgba(255,135,52,0.97)", "rgba(255,113,40,0.97)"],
      selectedBorder: "rgba(197,224,255,0.86)",
      adjustedBorder: "rgba(255,225,188,0.9)",
      iconChipBackground: "rgba(255,255,255,0.1)",
      iconChipBorder: "rgba(255,255,255,0.18)",
      iconChipBackgroundSelected: "rgba(231,241,255,0.24)",
      iconChipBorderSelected: "rgba(218,234,255,0.36)",
      iconChipBackgroundAdjusted: "rgba(255,245,233,0.57)",
      iconChipBorderAdjusted: "rgba(255,232,203,0.88)",
      iconColorDefault: "#AFD3FF",
      iconColorMuted: "#AFC7E8",
      iconColorSelected: "#EAF4FF",
      glossStrong: ["rgba(255,255,255,0.58)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0)"],
      glossSoft: ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0)"],
      titleText: textPrimary ?? "rgba(248,252,255,0.98)",
      valueText: textSecondary ?? "rgba(232,241,255,0.94)",
      mutedText: "rgba(206,221,245,0.88)",
      selectedTitleText: "rgba(249,253,255,0.99)",
      selectedValueText: "rgba(236,244,255,0.98)",
      adjustedTitleText: "rgba(70,32,2,0.96)",
      adjustedValueText: "rgba(97,43,3,0.95)",
      disabledOverlay: "rgba(18,23,33,0.45)",
      detailBackground: "rgba(39,45,57,0.95)",
      detailBorder: "rgba(255,255,255,0.12)",
      detailTitle: textPrimary ?? "rgba(245,250,255,0.98)",
      detailValue: textSecondary ?? "rgba(226,236,252,0.95)",
      detailMeta: "rgba(196,210,236,0.9)",
    };
  }

  return {
    boardBackground: "rgba(237,242,249,0.94)",
    boardBorder: "rgba(255,255,255,0.8)",
    boardInnerBorder: "rgba(255,255,255,0.7)",
    boardGlow: ["rgba(154,190,255,0.24)", "rgba(193,217,255,0.12)", "rgba(227,238,255,0)"],
    helperText: textSecondary ?? "rgba(65,89,128,0.86)",
    cardBorder: "rgba(255,255,255,0.88)",
    cardInnerBorder: "rgba(255,255,255,0.74)",
    cardShadow: "#8EB4E2",
    cardShadowOpacity: 0.19,
    cardElevation: 3,
    cardPaletteCategory: [
      ["rgba(255,255,255,0.97)", "rgba(245,250,255,0.96)", "rgba(237,246,255,0.95)"],
      ["rgba(255,255,255,0.97)", "rgba(249,247,255,0.96)", "rgba(242,244,255,0.95)"],
      ["rgba(255,255,255,0.97)", "rgba(246,251,248,0.96)", "rgba(238,248,243,0.95)"],
    ],
    cardPaletteStore: [
      ["rgba(248,253,255,0.98)", "rgba(239,247,255,0.97)", "rgba(231,242,255,0.96)"],
      ["rgba(247,252,255,0.98)", "rgba(241,247,255,0.97)", "rgba(233,243,255,0.96)"],
    ],
    cardPaletteSummary: [
      ["rgba(253,254,255,0.98)", "rgba(245,249,255,0.97)", "rgba(238,245,255,0.96)"],
      ["rgba(253,254,255,0.98)", "rgba(247,250,255,0.97)", "rgba(240,246,255,0.96)"],
    ],
    selectedPalette: ["rgba(239,247,255,0.99)", "rgba(223,239,255,0.98)", "rgba(206,229,255,0.97)"],
    adjustedPalette: ["rgba(255,196,130,0.98)", "rgba(255,164,88,0.97)", "rgba(255,142,70,0.96)"],
    selectedBorder: "rgba(130,182,255,0.82)",
    adjustedBorder: "rgba(255,219,178,0.98)",
    iconChipBackground: "rgba(255,255,255,0.72)",
    iconChipBorder: "rgba(255,255,255,0.9)",
    iconChipBackgroundSelected: "rgba(255,255,255,0.84)",
    iconChipBorderSelected: "rgba(255,255,255,0.96)",
    iconChipBackgroundAdjusted: "rgba(255,247,236,0.95)",
    iconChipBorderAdjusted: "rgba(255,230,198,0.98)",
    iconColorDefault: "#4E6FA5",
    iconColorMuted: "#627DA8",
    iconColorSelected: "#346AB8",
    glossStrong: ["rgba(255,255,255,0.9)", "rgba(255,255,255,0.42)", "rgba(255,255,255,0)"],
    glossSoft: ["rgba(255,255,255,0.62)", "rgba(255,255,255,0.24)", "rgba(255,255,255,0)"],
    titleText: textPrimary ?? "rgba(20,35,60,0.96)",
    valueText: textSecondary ?? "rgba(55,78,116,0.93)",
    mutedText: "rgba(74,97,133,0.84)",
    selectedTitleText: "rgba(24,43,74,0.97)",
    selectedValueText: "rgba(52,79,120,0.95)",
    adjustedTitleText: "rgba(74,33,1,0.95)",
    adjustedValueText: "rgba(98,47,3,0.92)",
    disabledOverlay: "rgba(235,241,248,0.58)",
    detailBackground: "rgba(255,255,255,0.87)",
    detailBorder: "rgba(255,255,255,0.72)",
    detailTitle: textPrimary ?? "#111827",
    detailValue: textSecondary ?? "#334155",
    detailMeta: textSecondary ?? "#64748B",
  };
}

