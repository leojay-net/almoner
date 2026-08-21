/**
 * Server-side Starknet JSON-RPC proxy.
 *
 * The browser needs an RPC endpoint to construct a provider, but the Alchemy key
 * must never ship in the bundle. This forwards requests using the server-held
 * key, so `STARKNET_RPC_URL` stays out of client code.
 *
 * Read-only methods only. An open proxy is somebody else's free RPC quota, so
 * anything not on this list is refused rather than forwarded.
 */
const ALLOWED_METHODS = new Set([
  "starknet_call",
  "starknet_chainId",
  "starknet_specVersion",
  "starknet_blockNumber",
  "starknet_blockHashAndNumber",
  "starknet_getBlockWithTxHashes",
  "starknet_getClassAt",
  "starknet_getClassHashAt",
  "starknet_getNonce",
  "starknet_getStorageAt",
  "starknet_getTransactionByHash",
  "starknet_getTransactionReceipt",
  "starknet_getTransactionStatus",
  "starknet_getEvents",
  "starknet_estimateFee",
]);

const MAX_BATCH = 20;

type JsonRpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

function refusal(id: unknown, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } };
}

export async function POST(request: Request) {
  const upstream = process.env.STARKNET_RPC_URL;
  if (!upstream) {
    return Response.json(
      { error: "STARKNET_RPC_URL is not configured on the server" },
      { status: 503 },
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return Response.json({ error: `batch must hold 1 to ${MAX_BATCH} calls` }, { status: 400 });
  }

  const blocked = calls.filter(
    (call) => typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method),
  );
  if (blocked.length > 0) {
    const rejections = blocked.map((call) =>
      refusal(call.id, `method not permitted through this proxy: ${String(call.method)}`),
    );
    return Response.json(Array.isArray(body) ? rejections : rejections[0], { status: 403 });
  }

  const response = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Chain state moves; never serve a cached answer.
    cache: "no-store",
  });

  if (!response.ok) {
    return Response.json({ error: `upstream RPC returned ${response.status}` }, { status: 502 });
  }

  return new Response(await response.text(), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
