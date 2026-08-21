/** Renders a smallest-unit amount with `decimals` places, trimming trailing zeros. */
export function formatUnits(amount: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = amount % base;
  if (fraction === 0n) return whole.toString();
  const digits = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${digits}`;
}

/** `0x040337…812a` — enough to recognise an address without filling the line. */
export function shortenFelt(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Unix seconds to a readable UTC instant. */
export function formatExpiry(expiry: bigint): string {
  if (expiry === 0n) return "never";
  return new Date(Number(expiry) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
