import { describe, expect, it } from "vitest";
import { createRandom } from "./random";

describe("seeded random generator", () => {
  it("reproduces the same sequence for the same seed", () => {
    const a = createRandom(1234);
    const b = createRandom(1234);
    const sequence = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(sequence);
  });

  it("gives different sequences for different seeds and stays in [0, 1)", () => {
    const a = Array.from({ length: 20 }, createRandom(1));
    const b = Array.from({ length: 20 }, createRandom(2));
    expect(a).not.toEqual(b);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
