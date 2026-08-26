/**
 * Wallets throw opaque errors.
 *
 * `UNKNOWN_ERROR` with an empty message is the common case, and reading only
 * `.message` throws away the code, data and cause that actually identify the
 * problem. This keeps everything the object carries.
 */
export function describeWalletError(error: unknown): string {
  if (typeof error === "string") return error;
  if (!(error instanceof Object)) return String(error);

  const parts: string[] = [];
  const record = error as Record<string, unknown>;

  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message) parts.push(message);

  for (const key of ["code", "name", "data", "reason"]) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const rendered = typeof value === "object" ? safeJson(value) : String(value);
    if (rendered && rendered !== message && !parts.includes(rendered)) {
      parts.push(`${key}: ${rendered}`);
    }
  }

  if (record.cause) {
    const cause = describeWalletError(record.cause);
    if (cause) parts.push(`cause: ${cause}`);
  }

  return parts.length > 0 ? parts.join(" · ") : safeJson(error) || "the wallet gave no detail";
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, Object.getOwnPropertyNames(Object(value)));
    return text === "{}" ? "" : text.slice(0, 400);
  } catch {
    return "";
  }
}

/**
 * Turns a wallet failure into something a person can act on.
 *
 * The extension-connection case matters most: a Chrome MV3 service worker that
 * has gone dormant makes every wallet call fail identically, and no amount of
 * checking our own inputs will find it.
 */
export function explainWalletError(error: unknown, context: { feeLabel: string }): string {
  const detail = describeWalletError(error);

  if (/receiving end does not exist|could not establish connection|disconnected port/i.test(detail)) {
    return `${detail}\n\nYour wallet extension is not responding. Its background worker has most likely gone to sleep — open the wallet from the toolbar so it wakes up, then try again. Reloading the extension or restarting the browser also clears it.`;
  }

  if (/unknown_error/i.test(detail) || detail === "the wallet gave no detail") {
    return `${detail}\n\nThe wallet could not build this transaction and did not say why. Most likely one of:\n• the extension's background worker is asleep — open the wallet from the toolbar, then retry\n• this wallet does not implement STRK20 on the network you are connected to\n• not enough balance to cover the amount plus the ${context.feeLabel} pool fee`;
  }

  return detail;
}
