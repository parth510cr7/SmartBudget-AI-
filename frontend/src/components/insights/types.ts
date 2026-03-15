export type InsightTileSize = "small" | "medium" | "large" | "wide" | "tall";

export type InsightTilePriority = "primary" | "secondary" | "tertiary";

export type InsightTileState = "default" | "pressed" | "selected" | "disabled" | "loading";

export type InsightTileContentMode =
  | "icon_label"
  | "label_value"
  | "icon_label_value"
  | "expanded_detail";

export type InsightTileKind = "category" | "store" | "summary";

export type InsightIconName =
  | "store"
  | "cart"
  | "bag"
  | "home"
  | "car"
  | "sparkles"
  | "heart"
  | "utensils"
  | "wallet"
  | "dollar"
  | "trend";

export type InsightTileModel = {
  id: string;
  kind: InsightTileKind;
  title: string;
  value: string;
  numericValue: number;
  detailLine?: string;
  quickStats?: string[];
  expandedLines?: string[];
  priority: InsightTilePriority;
  size: InsightTileSize;
  state?: InsightTileState;
  contentMode: InsightTileContentMode;
  iconName: InsightIconName;
  paletteIndex: number;
};

