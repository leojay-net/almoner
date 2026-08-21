import { describe, expect, it } from "vitest";

import { compareWalletApiVersion, highestVersion, satisfiesMinimum } from "./version.js";

describe("compareWalletApiVersion", () => {
  it("orders by numeric segment, not lexically", () => {
    // The bug this guards: "0.9" > "0.10" under string comparison.
    expect(compareWalletApiVersion("0.10.3", "0.9.0")).toBeGreaterThan(0);
    expect(compareWalletApiVersion("0.9.0", "0.10.3")).toBeLessThan(0);
  });

  it("treats equal versions as equal", () => {
    expect(compareWalletApiVersion("0.10.3", "0.10.3")).toBe(0);
  });

  it("pads missing segments with zero", () => {
    expect(compareWalletApiVersion("0.10", "0.10.0")).toBe(0);
    expect(compareWalletApiVersion("0.10.1", "0.10")).toBeGreaterThan(0);
  });

  it("ranks a prerelease below its release", () => {
    expect(compareWalletApiVersion("0.10.3-beta.4", "0.10.3")).toBeLessThan(0);
    expect(compareWalletApiVersion("0.10.3", "0.10.3-beta.4")).toBeGreaterThan(0);
  });

  it("tolerates malformed segments instead of producing NaN ordering", () => {
    expect(compareWalletApiVersion("0.x.3", "0.0.3")).toBe(0);
  });
});

describe("satisfiesMinimum", () => {
  it("accepts the exact minimum and anything above", () => {
    expect(satisfiesMinimum("0.10.3", "0.10.3")).toBe(true);
    expect(satisfiesMinimum("0.11.0", "0.10.3")).toBe(true);
  });

  it("rejects anything below, including a prerelease of the minimum", () => {
    expect(satisfiesMinimum("0.10.2", "0.10.3")).toBe(false);
    expect(satisfiesMinimum("0.10.3-beta.4", "0.10.3")).toBe(false);
  });
});

describe("highestVersion", () => {
  it("returns null for an empty list", () => {
    expect(highestVersion([])).toBeNull();
  });

  it("picks the highest numerically", () => {
    expect(highestVersion(["0.9.0", "0.10.3", "0.8.1"])).toBe("0.10.3");
  });
});
