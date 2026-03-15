import { prisma } from "../lib/db";

const MIN_CONFIDENCE = 0.8;

/**
 * Community price aggregation (verified for Phase 5).
 *
 * Query high-confidence COMMUNITY PriceRecords, group by (item, store, regionBucket),
 * compute aggregates, and upsert into CommunityPriceAggregate.
 * - regionBucket comes from PriceRecord.cityOrArea (set at receipt sync when user has community opt-in).
 * - Aggregation is anonymous: only averages/low/high/count per (item, store, region); no raw data exposed.
 * - Basket insights use these aggregates to show "nearby community average" for basket items; region is
 *   informational (no geographic radius filter is applied—all matching item/store aggregates are returned).
 */
export async function generateCommunityAggregates(): Promise<number> {
  const records = await prisma.priceRecord.findMany({
    where: {
      shareMode: "COMMUNITY",
      confidenceScore: { gte: MIN_CONFIDENCE },
      normalizedUnitPrice: { not: null },
      canonicalItemName: { not: null },
      canonicalStoreName: { not: null },
    },
    select: {
      canonicalItemName: true,
      canonicalStoreName: true,
      cityOrArea: true,
      normalizedUnitPrice: true,
    },
  });

  const key = (item: string, store: string, region: string) =>
    `${item}\t${store}\t${region}`;
  const groups = new Map<
    string,
    { canonicalItemName: string; canonicalStoreName: string; regionBucket: string; prices: number[] }
  >();

  for (const r of records) {
    const price = r.normalizedUnitPrice;
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    const item = (r.canonicalItemName ?? "").trim() || null;
    const store = (r.canonicalStoreName ?? "").trim() || null;
    if (!item || !store) continue;
    const region = (r.cityOrArea ?? "").trim() || "Unknown";
    const k = key(item, store, region);
    if (!groups.has(k)) {
      groups.set(k, { canonicalItemName: item, canonicalStoreName: store, regionBucket: region, prices: [] });
    }
    groups.get(k)!.prices.push(price);
  }

  let upserted = 0;
  for (const [, g] of groups) {
    const dataPointCount = g.prices.length;
    const averagePrice = g.prices.reduce((a, b) => a + b, 0) / dataPointCount;
    const lowestPrice = Math.min(...g.prices);
    const highestPrice = Math.max(...g.prices);
    await prisma.communityPriceAggregate.upsert({
      where: {
        canonicalItemName_canonicalStoreName_regionBucket: {
          canonicalItemName: g.canonicalItemName,
          canonicalStoreName: g.canonicalStoreName,
          regionBucket: g.regionBucket,
        },
      },
      create: {
        canonicalItemName: g.canonicalItemName,
        canonicalStoreName: g.canonicalStoreName,
        regionBucket: g.regionBucket,
        averagePrice,
        lowestPrice,
        highestPrice,
        dataPointCount,
      },
      update: {
        averagePrice,
        lowestPrice,
        highestPrice,
        dataPointCount,
        lastCalculatedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    upserted++;
  }
  return upserted;
}
