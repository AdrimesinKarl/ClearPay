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
it("keeps checkout as the default while discovery precedes runnable payments", async () => {
  const html = await screen();
  expect(html).toContain("<h2>Pay</h2>");
  expect(html).toContain("<h2>Live feed</h2>");
  expect(html).toContain("Checking deployment capabilities");
  expect(html).not.toContain("Per-payment recipient");
  expect(html).not.toContain(token);
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["prepare", "demo", "invalid"])("server render preserves %s guards and performs no upstream calls", async mode => {
  vi.stubEnv("PAIFLOW_MODE", mode);
  const html = await screen();
  expect(html).not.toContain("Per-payment recipient");
  expect(html).not.toContain(token);
  expect(fetchMock).not.toHaveBeenCalled();
  if (mode === "prepare") {
    expect(html).toContain("Preparation mode");
    expect(html).toContain("Live feed is disabled");
  }
  if (mode === "invalid") expect(html).toContain("Payments unavailable");
});
