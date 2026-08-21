import { beforeEach, describe, expect, it, vi } from "vitest";

const supportedWalletApi = vi.fn();

vi.mock("starknet", () => ({
  walletV6: {
    supportedWalletApi: (...args: unknown[]) => supportedWalletApi(...args),
  },
}));

const { detectStrk20Support, describeStrk20Support, STRK20_MIN_WALLET_API } = await import(
  "./detect.js"
);

// The detector only forwards this to starknet, which is mocked here.
const wallet = { name: "Test Wallet" } as never;

describe("detectStrk20Support", () => {
  beforeEach(() => {
    supportedWalletApi.mockReset();
  });

  it("reports support when the wallet meets the minimum", async () => {
    supportedWalletApi.mockResolvedValue(["0.8.0", "0.10.3"]);

    const result = await detectStrk20Support(wallet);

    expect(result.supported).toBe(true);
    expect(result.reason).toBe("supported");
    expect(result.highest).toBe("0.10.3");
    expect(result.minimumRequired).toBe(STRK20_MIN_WALLET_API);
  });

  it("reports below-minimum for an older wallet", async () => {
    supportedWalletApi.mockResolvedValue(["0.7.0", "0.8.0"]);

    const result = await detectStrk20Support(wallet);

    expect(result.supported).toBe(false);
    expect(result.reason).toBe("below-minimum");
    expect(result.highest).toBe("0.8.0");
  });

  it("distinguishes an empty version list from a failure", async () => {
    supportedWalletApi.mockResolvedValue([]);

    const result = await detectStrk20Support(wallet);

    expect(result.reason).toBe("no-versions-reported");
    expect(result.supported).toBe(false);
  });

  it("never throws when the wallet rejects, and keeps the message", async () => {
    supportedWalletApi.mockRejectedValue(new Error("wallet is locked"));

    const result = await detectStrk20Support(wallet);

    expect(result.supported).toBe(false);
    expect(result.reason).toBe("query-failed");
    expect(result.error).toBe("wallet is locked");
  });

  it("gives up on a wallet that never answers", async () => {
    supportedWalletApi.mockReturnValue(new Promise(() => {}));

    const result = await detectStrk20Support(wallet, { timeoutMs: 10 });

    expect(result.reason).toBe("query-failed");
    expect(result.error).toContain("did not answer");
  });

  it("never calls a balance-reading method to feature-detect", async () => {
    // Probing strk20Balances would trigger a wallet consent prompt for the
    // user's shielded balances, which a capability check has no reason to see.
    const strk20Balances = vi.fn();
    supportedWalletApi.mockResolvedValue(["0.10.3"]);

    await detectStrk20Support({ ...(wallet as object), strk20Balances } as never);

    expect(strk20Balances).not.toHaveBeenCalled();
  });

  it("honours a custom minimum", async () => {
    supportedWalletApi.mockResolvedValue(["0.10.3"]);

    const result = await detectStrk20Support(wallet, { minimumVersion: "0.11.0" });

    expect(result.supported).toBe(false);
  });
});

describe("describeStrk20Support", () => {
  it("explains each outcome in one line", async () => {
    supportedWalletApi.mockResolvedValue(["0.10.3"]);
    expect(describeStrk20Support(await detectStrk20Support(wallet))).toContain("supports");

    supportedWalletApi.mockResolvedValue(["0.8.0"]);
    expect(describeStrk20Support(await detectStrk20Support(wallet))).toContain("0.10.3 or later");
  });
});
