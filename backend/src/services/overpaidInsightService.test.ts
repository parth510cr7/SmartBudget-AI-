import { STAPLE_BENCHMARKS } from "../config/referenceStaplePrices";
import { detectItemFamilyId } from "./basketMatcherEngine";

describe("overpaid insight helpers", () => {
  test("staple benchmarks are positive", () => {
    for (const k of Object.keys(STAPLE_BENCHMARKS)) {
      const b = STAPLE_BENCHMARKS[k];
      expect(b.refQty).toBeGreaterThan(0);
      expect(b.refTotalUsd).toBeGreaterThan(0);
    }
  });

  test("detectItemFamilyId recognizes milk and eggs", () => {
    expect(detectItemFamilyId("Homo Milk 4L")).toBe("milk");
    expect(detectItemFamilyId("Large Eggs 12")).toBe("eggs");
  });
});
