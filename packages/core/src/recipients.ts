/**
 * Parsing a pasted recipient list.
 *
 * A payer's list arrives from a spreadsheet, so it is forgiving about
 * whitespace, delimiters and a header row — but strict about values. A batch is
 * one atomic transaction: a single malformed amount reverts the whole run after
 * the payer has signed, so every row is validated before anything is built.
 */

export interface ParsedRecipient {
  /** 1-based line number in the input, for error reporting. */
  readonly line: number;
  readonly address: string;
  /** In the token's smallest unit. */
  readonly amount: bigint;
}

export interface RecipientParseError {
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

export interface ParseResult {
  readonly recipients: readonly ParsedRecipient[];
  readonly errors: readonly RecipientParseError[];
}

export interface ParseOptions {
  /** Token decimals, for converting a decimal amount to smallest units. */
  readonly decimals?: number;
}

const MAX_U128 = 2n ** 128n - 1n;

/**
 * Converts a decimal string to smallest units without floating point.
 *
 * `parseFloat` would silently lose precision on amounts large enough to matter,
 * which is the wrong failure mode for money.
 */
export function parseDecimalAmount(input: string, decimals: number): bigint {
  const text = input.trim().replace(/_/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") {
    throw new Error(`not a number: "${input}"`);
  }

  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > decimals) {
    throw new Error(`more than ${decimals} decimal places`);
  }

  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole === "" ? "0" : whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/**
 * Parses `address,amount` rows. Accepts comma, semicolon, tab or whitespace
 * separators, skips blank lines and `#` comments, and drops a header row.
 *
 * Never throws: bad rows are collected so the UI can show every problem at once
 * rather than one per attempt.
 */
export function parseRecipients(input: string, options: ParseOptions = {}): ParseResult {
  const decimals = options.decimals ?? 18;
  const recipients: ParsedRecipient[] = [];
  const errors: RecipientParseError[] = [];
  const seen = new Map<string, number>();

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const text = rawLine.trim();
    if (text === "" || text.startsWith("#")) return;

    const parts = text.split(/[,;\t]|\s+/).filter((part) => part !== "");
    if (parts.length < 2) {
      errors.push({ line, text, reason: "expected an address and an amount" });
      return;
    }
    if (parts.length > 2) {
      errors.push({ line, text, reason: `expected 2 values, found ${parts.length}` });
      return;
    }

    const [addressPart, amountPart] = parts as [string, string];

    // A header row looks like a malformed row; recognise it instead of complaining.
    if (index === 0 && !addressPart.startsWith("0x")) {
      return;
    }

    let address: string;
    try {
      const value = BigInt(addressPart);
      if (value === 0n) throw new Error("zero");
      address = `0x${value.toString(16)}`;
    } catch {
      errors.push({ line, text, reason: `not a valid address: "${addressPart}"` });
      return;
    }

    let amount: bigint;
    try {
      amount = parseDecimalAmount(amountPart, decimals);
    } catch (error) {
      errors.push({ line, text, reason: error instanceof Error ? error.message : "bad amount" });
      return;
    }

    if (amount <= 0n) {
      errors.push({ line, text, reason: "amount must be greater than zero" });
      return;
    }
    if (amount > MAX_U128) {
      errors.push({ line, text, reason: "amount is too large for the pool" });
      return;
    }

    const previous = seen.get(address);
    if (previous !== undefined) {
      errors.push({ line, text, reason: `duplicate of line ${previous}` });
      return;
    }
    seen.set(address, line);

    recipients.push({ line, address, amount });
  });

  return { recipients, errors };
}
