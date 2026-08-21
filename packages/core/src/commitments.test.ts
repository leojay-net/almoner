import { describe, expect, it } from "vitest";

import {
  computeCommitmentHash,
  feltEquals,
  generateSecret,
  isValidSecret,
  normalizeFelt,
} from "./commitments.js";

// `'secret-one'` as a Cairo short string, the same literal the Cairo test uses.
const SECRET_ONE = "0x7365637265742d6f6e65";

describe("computeCommitmentHash", () => {
  it("matches the Cairo escrow byte for byte", () => {
    // Asserted identically in contracts/src/tests/test_escrow.cairo. If these
    // drift, every issued claim link becomes unredeemable: the payer commits to
    // one hash and the recipient proves a preimage of another.
    expect(computeCommitmentHash(SECRET_ONE)).toBe(
      "0x1c43a7fcd994cb13b1375f6d4bc28e03bb50f244905f9e1410664958a93712f",
    );
  });

  it("is deterministic", () => {
    expect(computeCommitmentHash(SECRET_ONE)).toBe(computeCommitmentHash(SECRET_ONE));
  });

  it("is domain-separated, so it is not a bare hash of the secret", () => {
    expect(computeCommitmentHash(SECRET_ONE)).not.toBe(SECRET_ONE);
  });

  it("separates distinct secrets", () => {
    expect(computeCommitmentHash("0x1")).not.toBe(computeCommitmentHash("0x2"));
  });
});

describe("generateSecret", () => {
  it("produces distinct, valid, non-zero secrets", () => {
    const secrets = new Set(Array.from({ length: 200 }, () => generateSecret()));
    expect(secrets.size).toBe(200);
    for (const secret of secrets) {
      expect(isValidSecret(secret)).toBe(true);
      expect(BigInt(secret)).toBeGreaterThan(0n);
    }
  });
});

describe("isValidSecret", () => {
  it("rejects zero, out-of-range and malformed values", () => {
    expect(isValidSecret("0x0")).toBe(false);
    expect(isValidSecret("not-a-number")).toBe(false);
    expect(isValidSecret("0x800000000000011000000000000000000000000000000000000000000000002")).toBe(
      false,
    );
  });
});

describe("felt helpers", () => {
  it("compares padded and unpadded forms as equal", () => {
    // Wallets and RPCs disagree on padding; string comparison gets this wrong.
    expect(feltEquals("0x01", "0x1")).toBe(true);
    expect(normalizeFelt("0x0000a")).toBe(normalizeFelt("0xa"));
  });
});
