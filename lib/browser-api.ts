"use client";
export async function browserRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = await response.json();
  if (!response.ok || value.error)
    throw new Error(
      `${value.error?.code || response.status}: ${value.error?.message || "Unresolved response. Retain the original payment record."}${response.headers.get("x-request-id") ? ` · request ${response.headers.get("x-request-id")}` : ""}`,
    );
  return value.data;
}
