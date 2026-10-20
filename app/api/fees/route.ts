import { publicConfig } from "@/lib/paiflow";
import { allFees, feesWithStatus } from "@/lib/payments";
import { handle, sameOrigin } from "@/lib/http";
import type { PublicConfig } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    const config: PublicConfig = publicConfig();
    return {
      ready: config.ready,
      message: config.ready ? undefined : config.message,
      fees: allFees(),
    };
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const text = await request.text();
    if (text.length > 4000) throw new Error("Request too large.");
    const body: unknown = JSON.parse(text);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>).from !== "string"
    )
      throw new Error("Invalid request.");
    return feesWithStatus((body as Record<string, unknown>).from);
  });
}
