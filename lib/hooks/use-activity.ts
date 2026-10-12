"use client";
import { useEffect, useState } from "react";
import type { EventItem, EventPage } from "@/lib/paiflow";
import { browserRequest, retryDelay } from "@/lib/browser-api";
export function useActivity(enabled: boolean, scope = "default") {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setEvents([]);
    setError("");
    if (!enabled) return;
    let stopped = false;
    let cursor: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let fetching = false;
    let nextRequestAt = 0;
    function schedule() {
      clearTimeout(timer);
      if (!stopped && !document.hidden && !fetching)
        timer = setTimeout(
          () => void poll(),
          Math.max(0, nextRequestAt - Date.now()),
        );
    }
    async function poll() {
      if (stopped || document.hidden || fetching) return;
      if (Date.now() < nextRequestAt) {
        schedule();
        return;
      }
      fetching = true;
      let delay = 5000;
      try {
        const page = await browserRequest<EventPage>(
          `/api/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (stopped) return;
        if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))
          throw new Error("Event pagination did not advance. Retry later.");
        cursor = page.nextCursor ?? cursor;
        setEvents((old) =>
          [
            ...new Map(
              [...old, ...page.items].map((e) => [e.eventId, e]),
            ).values(),
          ].sort((a, b) => b.ledger - a.ledger),
        );
        setError("");
        delay = page.hasMore ? 0 : 5000;
      } catch (e) {
        delay = retryDelay(e);
        if (!stopped)
          setError(e instanceof Error ? e.message : "Feed unavailable");
      } finally {
        fetching = false;
        nextRequestAt = Date.now() + delay;
        schedule();
      }
    }
    const visible = () => {
      clearTimeout(timer);
      schedule();
    };
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, scope]);
  return { events, error };
}
