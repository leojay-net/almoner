import { describe, expect, it } from "vitest";

import { decodeClaimLink, encodeClaimLink } from "./claim-link.js";

const SECRET = "0x2a";
const TOKEN = "0xaaa";
const BASE = "https://almoner.example/claim";

describe("encodeClaimLink", () => {
  it("puts the secret in the fragment, never the path or query", () => {
    // A secret in the query would land in server logs, proxy logs and Referer
    // headers. The fragment is never transmitted.
    const link = encodeClaimLink(BASE, { secret: SECRET, token: TOKEN });
    const url = new URL(link);

    expect(url.hash).toContain("s=0x2a");
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/claim");
    expect(url.pathname + url.search).not.toContain("2a");
  });

  it("includes the amount only when given", () => {
    expect(encodeClaimLink(BASE, { secret: SECRET, token: TOKEN })).not.toContain("a=");
    expect(encodeClaimLink(BASE, { secret: SECRET, token: TOKEN, amount: 100n })).toContain(
      "a=0x64",
    );
  });

  it("rejects an invalid secret or token", () => {
    expect(() => encodeClaimLink(BASE, { secret: "0x0", token: TOKEN })).toThrow(/secret/);
    expect(() => encodeClaimLink(BASE, { secret: SECRET, token: "0x0" })).toThrow(/token/);
  });
});

describe("decodeClaimLink", () => {
  it("round-trips a link", () => {
    const link = encodeClaimLink(BASE, { secret: SECRET, token: TOKEN, amount: 100n });
    expect(decodeClaimLink(link)).toEqual({ secret: SECRET, token: TOKEN, amount: 100n });
  });

  it("accepts a bare fragment with or without the hash", () => {
    expect(decodeClaimLink("#s=0x2a&t=0xaaa")).toEqual({ secret: SECRET, token: TOKEN });
    expect(decodeClaimLink("s=0x2a&t=0xaaa")).toEqual({ secret: SECRET, token: TOKEN });
  });

  it("normalizes padded felts", () => {
    expect(decodeClaimLink("#s=0x02a&t=0x0aaa")?.secret).toBe(SECRET);
  });

  it("returns null for anything malformed rather than throwing", () => {
    // This runs on user-pasted input; a bad link is a state, not an exception.
    for (const bad of [
      "",
      "#",
      "https://almoner.example/claim",
      "#s=0x2a",
      "#t=0xaaa",
      "#s=0x0&t=0xaaa",
      "#s=0x2a&t=0x0",
      "#s=nonsense&t=0xaaa",
      "#s=0x2a&t=0xaaa&a=0x0",
    ]) {
      expect(decodeClaimLink(bad)).toBeNull();
    }
  });
});
