import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GlassTile } from "./GlassTile";
import type { GlassTheme } from "./glassTheme";
import type { InsightTileModel, InsightTileSize } from "./types";

type PositionedTile = {
  tile: InsightTileModel;
  left: number;
  top: number;
  width: number;
  height: number;
};

type GlassTileGroupProps = {
  tiles: InsightTileModel[];
  theme: GlassTheme;
  selectedId: string | null;
  expandedId: string | null;
  adjustedIds: Set<string>;
  adjustMode: boolean;
  onSelect: (tile: InsightTileModel) => void;
  onExpand: (tile: InsightTileModel) => void;
  onReorderToIndex: (id: string, toIndex: number) => void;
  onSwapToIndex: (fromIndex: number, toIndex: number) => void;
  onRequestAdjustMode: () => void;
  onRequestExitAdjustMode: () => void;
};

type GridSpan = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

const CONTROL_CENTER_TEMPLATES: Record<number, GridSpan[]> = {
  1: [{ col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
  2: [
    { col: 0, row: 0, colSpan: 4, rowSpan: 2 },
    { col: 0, row: 2, colSpan: 4, rowSpan: 1 },
  ],
  3: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
  ],
  4: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
  ],
  5: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    { col: 0, row: 2, colSpan: 4, rowSpan: 1 },
  ],
  6: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
    { col: 0, row: 2, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
  ],
  7: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
    { col: 0, row: 2, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 0, row: 3, colSpan: 4, rowSpan: 1 },
  ],
  8: [
    { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
    { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
    { col: 0, row: 2, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    { col: 0, row: 3, colSpan: 2, rowSpan: 1 },
    { col: 2, row: 3, colSpan: 2, rowSpan: 1 },
  ],
};

function getSpanFromSize(size: InsightTileSize): Pick<GridSpan, "colSpan" | "rowSpan"> {
  switch (size) {
    case "large":
      return { colSpan: 2, rowSpan: 2 };
    case "wide":
      return { colSpan: 4, rowSpan: 1 };
    case "tall":
      return { colSpan: 1, rowSpan: 2 };
    case "medium":
      return { colSpan: 2, rowSpan: 1 };
    case "small":
    default:
      return { colSpan: 1, rowSpan: 1 };
  }
}

function layoutTiles(tiles: InsightTileModel[], boardWidth: number): { list: PositionedTile[]; height: number } {
  if (tiles.length === 0) return { list: [], height: 0 };

  const gridColumns = 4;
  const gap = 9;
  const width = Math.max(boardWidth, 312);
  const cellWidth = Math.floor((width - gap * (gridColumns - 1)) / gridColumns);
  const cellHeight = Math.round(cellWidth * 0.82);
  const list: PositionedTile[] = [];
  const template = CONTROL_CENTER_TEMPLATES[Math.min(8, Math.max(1, tiles.length))] ?? CONTROL_CENTER_TEMPLATES[8];
  let fallbackRow = 0;
  let fallbackCol = 0;

  tiles.forEach((tile, idx) => {
    const slot = template[idx];
    let col = 0;
    let row = 0;
    let colSpan = 1;
    let rowSpan = 1;

    if (slot) {
      col = slot.col;
      row = slot.row;
      colSpan = slot.colSpan;
      rowSpan = slot.rowSpan;
    } else {
      const fallback = getSpanFromSize(tile.size);
      col = fallbackCol;
      row = fallbackRow;
      colSpan = fallback.colSpan;
      rowSpan = fallback.rowSpan;
      fallbackCol += colSpan;
      if (fallbackCol >= gridColumns) {
        fallbackCol = 0;
        fallbackRow += 1;
      }
    }

    const left = col * (cellWidth + gap);
    const top = row * (cellHeight + gap);
    const tileWidth = colSpan * cellWidth + (colSpan - 1) * gap;
    const tileHeight = rowSpan * cellHeight + (rowSpan - 1) * gap;
    list.push({ tile, left, top, width: tileWidth, height: tileHeight });
  });

  const height = list.reduce((max, item) => Math.max(max, item.top + item.height), 0);
  return { list, height };
}

export function GlassTileGroup({
  tiles,
  theme,
  selectedId,
  expandedId,
  adjustedIds,
  adjustMode,
  onSelect,
  onExpand,
  onReorderToIndex,
  onSwapToIndex,
  onRequestAdjustMode,
  onRequestExitAdjustMode,
}: GlassTileGroupProps) {
  const [width, setWidth] = useState(0);
  const layout = useMemo(() => layoutTiles(tiles, width), [tiles, width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setWidth((prev) => (Math.abs(prev - nextWidth) <= 1 ? prev : nextWidth));
  };
  const slotCenters = useMemo(
    () => layout.list.map((slot) => ({ x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 })),
    [layout.list]
  );

  const onDrop = (id: string, centerX: number, centerY: number) => {
    if (!adjustMode || slotCenters.length === 0) return;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < slotCenters.length; i += 1) {
      const dx = slotCenters[i].x - centerX;
      const dy = slotCenters[i].y - centerY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
    }
    onReorderToIndex(id, bestIndex);
  };

  const slotAreas = useMemo(() => layout.list.map((s) => s.width * s.height), [layout.list]);
  const promoteTile = (id: string) => {
    if (!adjustMode) return;
    const fromIndex = tiles.findIndex((t) => t.id === id);
    if (fromIndex < 0) return;
    const fromArea = slotAreas[fromIndex] ?? 0;
    let best = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let i = 0; i < slotAreas.length; i += 1) {
      const area = slotAreas[i] ?? 0;
      if (area > fromArea && area < bestArea) {
        bestArea = area;
        best = i;
      }
    }
    if (best >= 0) onSwapToIndex(fromIndex, best);
  };

  const demoteTile = (id: string) => {
    if (!adjustMode) return;
    const fromIndex = tiles.findIndex((t) => t.id === id);
    if (fromIndex < 0) return;
    const fromArea = slotAreas[fromIndex] ?? 0;
    let best = -1;
    let bestArea = -1;
    for (let i = 0; i < slotAreas.length; i += 1) {
      const area = slotAreas[i] ?? 0;
      if (area < fromArea && area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
    if (best >= 0) onSwapToIndex(fromIndex, best);
  };

  return (
    <View style={styles.groupWrap} onLayout={onLayout}>
      <View style={[styles.absoluteStage, { height: Math.max(layout.height, 232) }]}>
        {layout.list.map((slot) => {
          return (
            <GlassTile
              key={slot.tile.id}
              tile={slot.tile}
              theme={theme}
              left={slot.left}
              top={slot.top}
              width={slot.width}
              height={slot.height}
              isSelected={selectedId === slot.tile.id}
              isExpanded={expandedId === slot.tile.id}
              isAdjusted={adjustedIds.has(slot.tile.id)}
              editMode={adjustMode}
              onPress={() => {
                if (!adjustMode) onSelect(slot.tile);
              }}
              onExpand={() => onExpand(slot.tile)}
              onEnterEditMode={() => onRequestAdjustMode()}
              onExitEditMode={() => onRequestExitAdjustMode()}
              onDrop={(centerX, centerY) => onDrop(slot.tile.id, centerX, centerY)}
              onPromoteSize={() => promoteTile(slot.tile.id)}
              onDemoteSize={() => demoteTile(slot.tile.id)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupWrap: {
    width: "100%",
  },
  absoluteStage: {
    width: "100%",
    position: "relative",
  },
});

