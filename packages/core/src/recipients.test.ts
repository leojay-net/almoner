import { describe, expect, it } from "vitest";

import { parseDecimalAmount, parseRecipients } from "./recipients.js";

describe("parseDecimalAmount", () => {
  it("converts without floating point loss", () => {
    // parseFloat would round this; money must not round.
    expect(parseDecimalAmount("1234567.123456789012345678", 18)).toBe(
      1234567123456789012345678n,
    );
  });

  it("handles whole numbers, bare fractions and separators", () => {
    expect(parseDecimalAmount("1", 18)).toBe(10n ** 18n);
    expect(parseDecimalAmount("0.5", 18)).toBe(5n * 10n ** 17n);
    expect(parseDecimalAmount(".5", 18)).toBe(5n * 10n ** 17n);
    expect(parseDecimalAmount("1_000", 18)).toBe(1000n * 10n ** 18n);
  });

  it("rejects excess precision rather than truncating it", () => {
    expect(() => parseDecimalAmount("1.1234567", 6)).toThrow(/decimal places/);
  });

  it("rejects non-numbers", () => {
    for (const bad of ["", ".", "abc", "1.2.3", "-1"]) {
      expect(() => parseDecimalAmount(bad, 18)).toThrow();
    }
  });
});

describe("parseRecipients", () => {
  it("parses comma, tab, semicolon and space separated rows", () => {
    const result = parseRecipients(
      ["0x1,1", "0x2\t2", "0x3;3", "0x4 4"].join("\n"),
      { decimals: 0 },
    );
    expect(result.errors).toEqual([]);
    expect(result.recipients.map((r) => r.amount)).toEqual([1n, 2n, 3n, 4n]);
  });

  it("skips blanks, comments and a header row", () => {
    const result = parseRecipients(
      ["address,amount", "", "# payroll for August", "0x1,5"].join("\n"),
      { decimals: 0 },
    );
    expect(result.errors).toEqual([]);
    expect(result.recipients).toHaveLength(1);
  });

  it("normalizes addresses so padding does not hide a duplicate", () => {
    const result = parseRecipients(["0x01,1", "0x1,2"].join("\n"), { decimals: 0 });
    expect(result.recipients).toHaveLength(1);
    expect(result.errors[0]?.reason).toMatch(/duplicate of line 1/);
  });

  it("collects every bad row instead of stopping at the first", () => {
    const result = parseRecipients(
      ["0x1,1", "oops", "0xzz,1", "0x3,abc", "0x4,0", "0x0,1"].join("\n"),
      { decimals: 0 },
    );
    expect(result.recipients).toHaveLength(1);
    expect(result.errors).toHaveLength(5);
    expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it("reports the line number of each problem", () => {
    const result = parseRecipients(["0x1,1", "0x2,nope"].join("\n"), { decimals: 0 });
    expect(result.errors[0]).toMatchObject({ line: 2, text: "0x2,nope" });
  });

  it("rejects a row with too many columns", () => {
    const result = parseRecipients("0x1,1,extra", { decimals: 0 });
    expect(result.errors[0]?.reason).toMatch(/found 3/);
  });

  it("returns empty for empty input", () => {
    expect(parseRecipients("")).toEqual({ recipients: [], errors: [] });
  });
});
