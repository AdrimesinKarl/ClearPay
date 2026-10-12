import "server-only";
// starter code, not a supported package — edit freely.

export type Prepared = {
  xdr: string;
  networkPassphrase: string;
  network: "testnet" | "mainnet";
  expiresAt: string;
};
export type Submitted = {
  txHash: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  ledger?: number;
  error?: { code: string; message: string };
};
type ApiFailure = {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: string;
};
export class PaiflowError extends Error {
  constructor(
    readonly status: number,
    readonly api: ApiFailure,
    readonly retryAfter: string | null,
    readonly requestId: string | null,
  ) {
    super(api.message);
  }
}
type Config = { origin: string; deploymentId: string; token: string };
export type Mode = "prepare" | "demo" | "team";
export type PublicConfig =
  | { mode: "prepare" | "demo"; deploymentUrl: null }
  | { mode: "team"; deploymentUrl: string }
  | { mode: "disabled"; deploymentUrl: null; message: string };

function configurationError(message: string): never {
  throw new PaiflowError(503, { code: "CONFIGURATION", message }, null, null);
}
function mode(): Mode {
  const value = process.env.PAIFLOW_MODE?.trim() ?? "prepare";
  if (value === "prepare" || value === "demo" || value === "team") return value;
  return configurationError("Set PAIFLOW_MODE to prepare, demo or team.");
}
function origin() {
  try {
    const url = new URL(
      process.env.PAIFLOW_BASE_URL || "https://beta.app.paiflow.xyz",
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return configurationError("Set PAIFLOW_BASE_URL to a platform origin.");
    return url.origin;
  } catch {
    return configurationError("Set PAIFLOW_BASE_URL to a platform origin.");
  }
}
function teamConfig(): Config {
  const token = process.env.PAIFLOW_API_TOKEN?.trim();
  const deploymentId = process.env.PAIFLOW_DEPLOYMENT_ID?.trim();
  if (!token || !deploymentId)
    return configurationError(
      "Team mode requires PAIFLOW_API_TOKEN and PAIFLOW_DEPLOYMENT_ID.",
    );
  if (!/^pfk_[a-f0-9]{64}$/.test(token))
    return configurationError(
      "Set a valid deployment API token for team mode.",
    );
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      deploymentId,
    )
  )
    return configurationError("Set a valid deployment UUID for team mode.");
  return { origin: origin(), deploymentId, token };
}
export function requireIntegration(): "demo" | "team" {
  const selected = mode();
  switch (selected) {
    case "prepare":
      throw new PaiflowError(
        403,
        {
          code: "PREPARATION_MODE",
          message:
            "Payments and the live feed are disabled in preparation mode.",
        },
        null,
        null,
      );
    case "demo":
      origin();
      return selected;
    case "team":
      teamConfig();
      return selected;
    default: {
      const unreachable: never = selected;
      return unreachable;
    }
  }
}
type Demo = Config & { expires: number };
type DemoCache = { demo?: Demo; minting?: Promise<Demo> };
// Next builds separate route bundles. Share the cache across those bundles and dev reloads.
const processState = globalThis as typeof globalThis & {
  __paiflowDemoCache?: Map<string, DemoCache>;
};
const demoCaches = (processState.__paiflowDemoCache ??= new Map<
  string,
  DemoCache
>());
export function publicConfig(): PublicConfig {
  try {
    const selected = mode();
    switch (selected) {
      case "prepare":
        return { mode: selected, deploymentUrl: null };
      case "demo":
        origin();
        return { mode: selected, deploymentUrl: null };
      case "team": {
        const config = teamConfig();
        return {
          mode: selected,
          deploymentUrl: new URL(
            `/deployments/${config.deploymentId}`,
            config.origin,
          ).href,
        };
      }
      default: {
        const unreachable: never = selected;
        return unreachable;
      }
    }
  } catch (error) {
    if (error instanceof PaiflowError && error.api.code === "CONFIGURATION")
      return { mode: "disabled", deploymentUrl: null, message: error.message };
    throw error;
  }
}
async function config(): Promise<Config> {
  if (requireIntegration() === "team") return teamConfig();
  const platformOrigin = origin();
  const cache = demoCaches.get(platformOrigin) ?? {};
  demoCaches.set(platformOrigin, cache);
  if (cache.demo && Date.now() < cache.demo.expires - 120_000)
    return cache.demo;
  // Single flight: concurrent requests must not consume the 3/hour token allowance.
  if (!cache.minting)
    cache.minting = getDemoToken(platformOrigin)
      .then((value) => {
        const expires = Date.parse(value.expiresAt);
        if (!Number.isFinite(expires) || expires <= Date.now() + 120_000)
          throw new Error("Demo token validity is too short.");
        cache.demo = {
          origin: platformOrigin,
          token: value.token,
          deploymentId: value.deploymentId,
          expires,
        };
        return cache.demo;
      })
      .finally(() => {
        cache.minting = undefined;
      });
  return cache.minting;
}
async function call<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
  query?: URLSearchParams,
): Promise<T> {
  const { origin, deploymentId, token } = await config();
  const url = new URL(
    ["api", "v1", "deployments", deploymentId, endpoint].join("/"),
    origin + "/",
  );
  if (query) url.search = query.toString();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const requestId = response.headers.get("x-request-id");
  const unexpected = `Unexpected Paiflow HTTP ${response.status}${requestId ? ` (x-request-id: ${requestId})` : ""}`;
  let result: { data: T } | { error: ApiFailure };
  try {
    result = await response.json();
  } catch {
    throw new PaiflowError(
      response.ok ? 502 : response.status,
      { code: "UPSTREAM_RPC", message: unexpected },
      response.headers.get("Retry-After"),
      requestId,
    );
  }
  if ("error" in result) {
    throw new PaiflowError(
      response.status,
      result.error,
      response.headers.get("Retry-After"),
      requestId,
    );
  }
  if (!response.ok)
    throw new PaiflowError(
      response.ok ? 502 : response.status,
      { code: "UPSTREAM_RPC", message: unexpected },
      response.headers.get("Retry-After"),
      requestId,
    );
  return result.data;
}
// Only expose a boolean to the client; the token and raw capability response stay server-side.
export async function payoutsAvailable(): Promise<boolean> {
  if (requireIntegration() !== "team") return false;
  const capabilities = await call<{
    network?: string;
    operations?: { payouts?: { status?: string } };
  }>("capabilities", "GET");
  const status = capabilities?.operations?.payouts?.status;
  return (
    capabilities?.network === "testnet" &&
    (status === "supported" || status === "conditional")
  );
}

export const prepareExecute = (input: { from: string; amount: string }) =>
  call<Prepared>("execute", "POST", input);
export const submitExecute = (input: { signedXdr: string }, wait = true) =>
  call<Submitted>(
    "execute/submit",
    "POST",
    input,
    new URLSearchParams({ wait: String(wait) }),
  );

export type EventItem = {
  id: string;
  eventId: string;
  kind: string;
  topic: string | null;
  ledger: number;
  txHash: string;
  occurredAt: string;
  data: unknown;
};
export type EventPage = {
  items: EventItem[];
  nextCursor: string | null;
  hasMore: boolean;
};
export function listEvents(
  input: { cursor?: string; limit?: number; txHash?: string } = {},
) {
  const query = new URLSearchParams();
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.txHash) query.set("txHash", input.txHash);
  return call<EventPage>("events", "GET", undefined, query);
}

// One page at a time in your server polling handler:
// const page = await listEvents({ cursor: savedCursor ?? undefined });
// savedCursor = page.nextCursor;
// return page; // browser drains hasMore, then waits before asking again

export const preparePayout = (input: {
  from: string;
  amount: string;
  recipient: string;
  nodeId?: string;
}) => call<Prepared & { nodeId: string }>("payouts", "POST", input);
export const submitPayout = (input: { signedXdr: string }, wait = true) =>
  call<Submitted>(
    "payouts/submit",
    "POST",
    input,
    new URLSearchParams({ wait: String(wait) }),
  );

// Catch PaiflowError in your server handler. For status 409/429, forward status
// and Retry-After to your UI; wait that many seconds before retrying.
// Keep a submitted envelope to retry submitPayout while outcome is uncertain.

export const releaseEarly = (input: { nodeId?: string } = {}) =>
  call<{ nodeId: string; txHash: string; ledger?: number }>(
    "release-early",
    "POST",
    input,
  );
// Teams must add their own authorisation before exposing releaseEarly in a server route.
// This starter deliberately has no release route or button.

export async function getOpenApi(origin: string): Promise<unknown> {
  requireIntegration();
  const response = await fetch(new URL("/api/v1/openapi.json", origin));
  if (!response.ok) throw new Error(`OpenAPI HTTP ${response.status}`);
  return response.json();
}
export async function getDemoToken(origin: string) {
  if (requireIntegration() !== "demo")
    throw new PaiflowError(
      403,
      { code: "FORBIDDEN", message: "Demo access requires PAIFLOW_MODE=demo." },
      null,
      null,
    );
  const response = await fetch(new URL("/api/v1/demo-token", origin), {
    method: "POST",
  });
  const body = (await response.json()) as
    | { data: { deploymentId: string; token: string; expiresAt: string } }
    | { error: ApiFailure };
  if ("error" in body)
    throw new PaiflowError(
      response.status,
      body.error,
      response.headers.get("Retry-After"),
      response.headers.get("x-request-id"),
    );
  if (!response.ok) throw new Error(`Demo HTTP ${response.status}`);
  return body.data; // keep token server-side
}
