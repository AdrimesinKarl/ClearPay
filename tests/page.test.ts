import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/wallet", () => ({}));
const token = `pfk_${"a".repeat(64)}`;
const deployment = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_API_TOKEN", token);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", deployment);
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function screen() {
  const { default: Page } = await import("@/app/page");
  return renderToStaticMarkup(await Page());
}
it.each(["supported", "conditional"])(
  "shows recipient form for %s payouts without exposing credentials",
  async (status) => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          network: "testnet",
          operations: { payouts: { status } },
          token,
        },
      }),
    );
    const html = await screen();
    expect(html).toContain("Per-payment recipient");
    expect(html).not.toContain(token);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `http://localhost:3000/api/v1/deployments/${deployment}/capabilities`,
    );
    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
  },
);
it.each([
  { network: "testnet", operations: { payouts: { status: "unsupported" } } },
  { network: "testnet", operations: { payouts: { status: "unknown" } } },
  { network: "mainnet", operations: { payouts: { status: "conditional" } } },
  {},
  null,
])(
  "hides unsupported or unknown payout capabilities and keeps ordinary Pay",
  async (data) => {
    fetchMock.mockResolvedValue(Response.json({ data }));
    const html = await screen();
    expect(html).not.toContain("Per-payment recipient");
    expect(html).toContain("<h2>Pay</h2>");
    expect(html).toContain("<h2>Live feed</h2>");
  },
);
it("keeps ordinary payments when discovery fails", async () => {
  fetchMock.mockRejectedValue(new Error("Discovery unavailable"));
  const html = await screen();
  expect(html).not.toContain("Per-payment recipient");
  expect(html).toContain("<h2>Pay</h2>");
});
it.each(["prepare", "demo", "invalid"])(
  "does not discover capabilities in %s mode",
  async (mode) => {
    vi.stubEnv("PAIFLOW_MODE", mode);
    expect(await screen()).not.toContain("Per-payment recipient");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
