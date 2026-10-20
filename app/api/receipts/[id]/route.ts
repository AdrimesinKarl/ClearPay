import { receiptFor } from "@/lib/payments";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const receipt = receiptFor(id);
  if (!receipt)
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Unknown receipt reference." } },
      { status: 404 },
    );
  return Response.json({ data: receipt });
}
