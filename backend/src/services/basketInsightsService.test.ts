import { prisma } from "../lib/db";
import { getBasketInsights } from "./basketInsightsService";
import { getBasketSuggestions } from "./basketSuggestionService";

/**
 * Integration-style tests for basket insights pipeline.
 *
 * These use the real Prisma client. They assume a working DATABASE_URL for tests.
 * If the environment is not configured for DB tests, skip by setting SKIP_DB_TESTS=1.
 */
const SKIP = process.env.SKIP_DB_TESTS === "1";

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe("basket insights pipeline (db)", () => {
  if (SKIP) {
    test("skipped (SKIP_DB_TESTS=1)", () => {});
    return;
  }

  test("finalize returns estimate + best store with partial coverage", async () => {
    const firebaseId = uniqueId("dev-test");
    const user = await prisma.user.create({
      data: {
        firebaseId,
        email: `${firebaseId}@test.local`,
        name: "Test User",
        customCategories: [],
      },
    });

    const storeA = await prisma.store.create({
      data: { userId: user.id, name: "CostLess", address: "1 Main St" },
    });
    const storeB = await prisma.store.create({
      data: { userId: user.id, name: "FreshMart", address: "99 Market Ave" },
    });

    const r1 = await prisma.receipt.create({
      data: {
        userId: user.id,
        uploadedByUserId: user.id,
        householdId: null,
        visibilityType: "PERSONAL",
        storeId: storeA.id,
        date: new Date("2026-03-01"),
        subtotal: 12,
        tax: 0,
        total: 12,
        status: "VERIFIED",
        extractionSource: "cloud",
      },
    });
    const r2 = await prisma.receipt.create({
      data: {
        userId: user.id,
        uploadedByUserId: user.id,
        householdId: null,
        visibilityType: "PERSONAL",
        storeId: storeB.id,
        date: new Date("2026-03-05"),
        subtotal: 20,
        tax: 0,
        total: 20,
        status: "VERIFIED",
        extractionSource: "cloud",
      },
    });

    await prisma.item.createMany({
      data: [
        // Store A cheaper for milk + eggs
        { receiptId: r1.id, name: "2% Milk 2L", rawName: "2% Milk 2L", quantity: 1, unit: "item", unitPrice: 4.5, totalPrice: 4.5, category: "Groceries" },
        { receiptId: r1.id, name: "Eggs Dozen", rawName: "Eggs Dozen", quantity: 1, unit: "item", unitPrice: 3.25, totalPrice: 3.25, category: "Groceries" },
        // Store B has bread only (partial)
        { receiptId: r2.id, name: "Whole Wheat Bread", rawName: "Whole Wheat Bread", quantity: 1, unit: "item", unitPrice: 4.0, totalPrice: 4.0, category: "Groceries" },
      ],
    });

    const result = await getBasketInsights(user.id, { itemNames: ["milk", "eggs", "bread"] });

    expect(result.estimatedTotalKnownData).toBeGreaterThan(0);
    expect(result.matchedBasketLines?.length).toBeGreaterThan(0);
    expect(result.unmatchedBasketLines).toBeDefined();
    expect(result.bestStore).toBeDefined();
    expect(typeof result.bestStore.enabled).toBe("boolean");
    // Optimizer should pick CostLess (covers 2 of 3 with good evidence)
    expect(result.bestStore.enabled).toBe(true);
    expect(result.bestTotalStore?.storeName).toBe("CostLess");

    // Suggestions should return receipt items for query "mil"
    const suggestions = await getBasketSuggestions(user.id, "mil", 10);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].label.toLowerCase()).toContain("milk");
  });
});

