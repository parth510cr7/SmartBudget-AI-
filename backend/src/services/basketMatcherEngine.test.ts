import {
  matchBasketToReceiptName,
  receiptLineMatchesBasketItem,
  MATCH_THRESHOLD_COVERAGE,
} from "./basketMatcherEngine";

describe("basketMatcherEngine", () => {
  test("exact match is strong", () => {
    const m = matchBasketToReceiptName("Milk 2%", "milk 2%");
    expect(m.score).toBeGreaterThanOrEqual(0.9);
    expect(m.tier).toBe("strong");
  });

  test("milk matches organic whole milk", () => {
    const m = matchBasketToReceiptName("milk", "Organic Whole Milk 4L");
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_COVERAGE);
    expect(["medium", "strong", "weak"]).toContain(m.tier);
  });

  test("coke family matches coca cola", () => {
    const m = matchBasketToReceiptName("coke", "Coca Cola 355ml");
    expect(m.score).toBeGreaterThan(0.3);
  });

  test("receiptLineMatchesBasketItem uses shared threshold", () => {
    expect(receiptLineMatchesBasketItem("milk", { name: "2% Milk 2L" })).toBe(true);
    expect(receiptLineMatchesBasketItem("xyzunknown123", { name: "Bananas" })).toBe(false);
  });

  test("chips matches potato chips line", () => {
    const m = matchBasketToReceiptName("Chips", "Lay's Potato Chips 200g");
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_COVERAGE);
  });

  test("bilingual lait matches milk basket", () => {
    const m = matchBasketToReceiptName("milk", "Lait 2% 4L");
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_COVERAGE);
  });

  test("bread matches whole wheat receipt", () => {
    const m = matchBasketToReceiptName("bread", "WW Bread Sliced");
    expect(m.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_COVERAGE);
  });
});
