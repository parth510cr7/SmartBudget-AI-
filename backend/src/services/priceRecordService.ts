import { prisma } from "../lib/db";
import { isEssentialCategoryForPriceTracking } from "../config/categories";

type ShareMode = "NONE" | "PRIVATE" | "GROUP" | "COMMUNITY";

const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Cleans and returns an uppercase canonical item name (for now; AI canonicalization later).
 * Room for: AI normalization, manual relabel, canonical dictionary.
 */
function toCanonicalItemName(rawItemName: string): string {
  return rawItemName
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase() || rawItemName;
}

/**
 * Canonical store name (normalized). Future: AI/store dictionary, merge tools.
 */
function toCanonicalStoreName(rawStoreName: string): string {
  return rawStoreName
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase() || rawStoreName;
}

/**
 * Syncs a receipt and its items into PriceRecord rows for the Price Intelligence Engine.
 * Low-confidence OCR items never enter COMMUNITY mode (downgraded to NONE).
 * COMMUNITY is only set when user isCommunityOptIn and record is eligible (confidence, etc.).
 *
 * Future hooks: reviewBeforeSync (skip auto-sync until reviewed), excludedCategories (skip by category).
 *
 * @param receiptId - ID of the saved receipt
 * @param userSharePreference - User's chosen share mode (GROUP/PRIVATE/COMMUNITY)
 * @param cityOrArea - Geographic context (e.g. "Toronto", "Unknown")
 * @param lat - Optional user lat for 30km community filter
 * @param lng - Optional user lng for 30km community filter
 */
export async function syncReceiptToPriceRecords(
  receiptId: string,
  userSharePreference: ShareMode,
  cityOrArea: string,
  lat?: number | null,
  lng?: number | null
): Promise<void> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      items: true,
      store: true,
      user: { select: { id: true, isCommunityOptIn: true } },
    },
  });

  if (!receipt) return;
  if (!receipt.items.length) return;

  const storeName = receipt.store?.name ?? "Unknown";
  const rawStoreName = storeName;
  const canonicalStoreName = toCanonicalStoreName(storeName);
  const ownerUserId = receipt.userId;
  const createdByUserId = receipt.userId;
  const purchaseDate = receipt.date;

  // Contribution gating: COMMUNITY only when user opted in and we would use COMMUNITY for this record.
  // Do not silently convert all records to COMMUNITY just because opt-in exists.
  const userOptedInCommunity = receipt.user?.isCommunityOptIn === true;

  const records = receipt.items
    .filter((item) => isEssentialCategoryForPriceTracking(item.category))
    .map((item) => {
    const confidenceScore =
      (item as unknown as { confidenceScore?: number }).confidenceScore ?? 1.0;

    let finalShareMode = userSharePreference;
    if (finalShareMode === "COMMUNITY") {
      if (!userOptedInCommunity || confidenceScore < CONFIDENCE_THRESHOLD) finalShareMode = "NONE";
    }
    if (confidenceScore < CONFIDENCE_THRESHOLD && finalShareMode === "COMMUNITY") {
      finalShareMode = "NONE";
    }

    const quantity = item.quantity ?? 1;
    const price = item.totalPrice;
    const normalizedUnitPrice = quantity > 0 ? price / quantity : price;

    const latNum = typeof lat === "number" && Number.isFinite(lat) ? lat : null;
    const lngNum = typeof lng === "number" && Number.isFinite(lng) ? lng : null;

    return {
      sourceReceiptId: receiptId,
      ownerUserId,
      createdByUserId,
      shareMode: finalShareMode,
      groupId: receipt.groupId,
      sharedWithUserId: null as string | null,
      storeName,
      rawStoreName,
      canonicalStoreName,
      rawItemName: item.rawName,
      canonicalItemName: toCanonicalItemName(item.rawName),
      itemCategory: item.category ?? null,
      brandName: (item as unknown as { brandName?: string }).brandName ?? null,
      price,
      quantity,
      unit: item.unit ?? "item",
      normalizedUnitPrice,
      currency: "USD",
      purchaseDate,
      cityOrArea: cityOrArea || null,
      lat: latNum,
      lng: lngNum,
      confidenceScore,
    };
  });

  if (records.length === 0) return;

  if (userSharePreference === "COMMUNITY") {
    await prisma.priceRecord.deleteMany({
      where: { sourceReceiptId: receiptId, shareMode: "COMMUNITY" },
    });
  }

  await prisma.priceRecord.createMany({
    data: records,
  });
}
