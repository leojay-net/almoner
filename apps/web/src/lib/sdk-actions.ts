import type { STRK20_ACTION } from "@starknet-io/types-js";

/**
 * Translating wallet actions onto the SDK builder.
 *
 * Both routes speak `STRK20_ACTION[]` so the rest of the app is route-agnostic,
 * but the SDK takes a fluent builder rather than an action list. This is the
 * adapter, and it is the only place that knows the two shapes differ.
 */

export interface TokenOps {
  deposit: (o: { amount: bigint }) => unknown;
  transfer: (o: { recipient: string; amount: bigint | unknown }) => unknown;
  withdraw: (o: { recipient?: string; amount: bigint }) => unknown;
}

export interface Builder {
  with: (token: string, ops: (t: TokenOps) => void) => Builder;
  invoke: (build: (args: InvokeArgs) => { contractAddress: string; calldata: string[] }) => Builder;
  surplusTo: (recipient: string) => Builder;
}

export interface InvokeArgs {
  openNotes?: Array<{ noteId?: string | bigint; note_id?: string | bigint }>;
  poolAddress?: string;
}

const OPEN_NOTE = /^\$\{openNoteIds\[(\d+)\]\}$/;
const POOL = "${poolAddress}";

/**
 * Resolves the placeholders a wallet would have expanded.
 *
 * On the wallet route these are substituted inside the extension. The SDK hands
 * back the real note ids and pool address instead, so the same calldata has to be
 * filled in here — otherwise the escrow receives literal `${openNoteIds[0]}`
 * strings and the call reverts on deserialisation.
 */
export function resolveCalldata(calldata: readonly string[], args: InvokeArgs): string[] {
  const notes = args.openNotes ?? [];
  return calldata.map((item) => {
    if (item === POOL) {
      if (!args.poolAddress) throw new Error("invoke calldata used ${poolAddress}, none supplied");
      return args.poolAddress;
    }
    const match = OPEN_NOTE.exec(item);
    if (!match) return item;

    const index = Number(match[1]);
    const note = notes[index];
    if (note === undefined) {
      throw new Error(
        `invoke calldata referenced open note ${index}, but only ${notes.length} were created`,
      );
    }
    const id = note.noteId ?? note.note_id;
    if (id === undefined) throw new Error(`open note ${index} has no id`);
    return typeof id === "bigint" ? `0x${id.toString(16)}` : String(id);
  });
}

/** Applies an action list to a builder, preserving the pool's phase ordering. */
export function applyActions(builder: Builder, actions: readonly STRK20_ACTION[], open: unknown) {
  for (const action of actions) {
    switch (action.type) {
      case "deposit":
        builder.with(action.token, (t) => t.deposit({ amount: BigInt(action.amount) }));
        break;
      case "transfer":
        builder.with(action.token, (t) =>
          t.transfer({
            recipient: action.recipient,
            amount: action.amount === "OPEN" ? open : BigInt(action.amount),
          }),
        );
        break;
      case "withdraw":
        builder.with(action.token, (t) =>
          t.withdraw({ recipient: action.recipient, amount: BigInt(action.amount) }),
        );
        break;
      case "invoke":
        builder.invoke((args) => ({
          contractAddress: action.contract,
          calldata: resolveCalldata(action.calldata, args),
        }));
        break;
    }
  }
  return builder;
}
