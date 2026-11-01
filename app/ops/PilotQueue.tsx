"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";
import { MAX_REJECTION_REASON } from "@/lib/onboarding";
import type { PilotApplication } from "@/lib/services/onboarding";
import { cn } from "@/lib/utils";

import { approvePilotAction, rejectPilotAction } from "./actions";

type Queue = { pending: PilotApplication[]; recent: PilotApplication[] };

const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function submittedAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes > -60) return ago.format(minutes, "minute");
  if (minutes > -60 * 24) return ago.format(Math.round(minutes / 60), "hour");
  return ago.format(Math.round(minutes / 1440), "day");
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * "Pilot verification" on the ops dashboard: approve, or reject with a
 * reason the Pilot sees. Documents are simulated, so ops review the
 * details the Pilot typed rather than photos.
 */
export function PilotQueue({ initial }: { initial: Queue }) {
  const [queue, setQueue] = useState(initial);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<Queue>>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setQueue(result.data);
      setRejecting(null);
      setReason("");
    });
  }

  return (
    <section
      aria-labelledby="queue-h"
      className="flex flex-col rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-[18px] py-3.5">
        <h2 id="queue-h" className="font-heading text-[17px] font-bold">
          Pilot verification
        </h2>
        <span
          className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn"
          data-testid="pending-count"
        >
          {queue.pending.length} pending
        </span>
      </div>

      {error && (
        <p role="alert" className="px-[18px] pt-3 text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}

      {queue.pending.length === 0 && queue.recent.length === 0 && (
        <p className="px-[18px] py-6 text-sm text-muted-foreground">
          No applications yet. New Pilots appear here once they send their documents.
        </p>
      )}

      <ul>
        {queue.pending.map((p) => (
          <li
            key={p.pilotId}
            aria-label={`Application from ${p.name}`}
            className="flex flex-col gap-3 border-b border-border px-[18px] py-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold">
                {initialsOf(p.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {p.name} · {p.vehicle} · <span className="font-normal">{p.cometId}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.plate} · {p.vehicleDetail} · {p.licence} · UPI {p.payout} · sent{" "}
                  {submittedAgo(p.submittedAt)}
                </span>
              </span>
              {rejecting !== p.pilotId && (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setRejecting(p.pilotId);
                      setReason("");
                      setError(null);
                    }}
                    aria-label={`Reject ${p.name}`}
                    className="h-[34px] rounded-sm border border-border bg-card px-2.5 text-[13px] font-bold text-danger-text"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => approvePilotAction({ pilotId: p.pilotId }))}
                    aria-label={`Approve ${p.name}`}
                    className="h-[34px] rounded-sm bg-ink px-2.5 text-[13px] font-bold text-on-ink"
                  >
                    Approve
                  </button>
                </span>
              )}
            </div>
            {rejecting === p.pilotId && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => rejectPilotAction({ pilotId: p.pilotId, reason }));
                }}
              >
                <label htmlFor={`reason-${p.pilotId}`} className="text-[13px] font-semibold">
                  What should {p.name.split(" ")[0]} fix? They&apos;ll see this.
                </label>
                <textarea
                  id={`reason-${p.pilotId}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={MAX_REJECTION_REASON}
                  rows={2}
                  className="rounded-md border-2 border-border bg-card p-3 text-sm outline-none focus:border-primary"
                />
                <span className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={pending}
                    className="h-9 rounded-sm bg-danger-text font-bold text-white hover:bg-danger-text/90"
                  >
                    Send back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRejecting(null)}
                    className="h-9 rounded-sm font-bold"
                  >
                    Cancel
                  </Button>
                </span>
              </form>
            )}
          </li>
        ))}
        {queue.recent.map((p) => (
          <li
            key={p.pilotId}
            className="flex items-center gap-3 border-b border-border px-[18px] py-3 last:border-b-0"
          >
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold">
              {initialsOf(p.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {p.name} · {p.vehicle}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {p.status === "rejected" ? p.rejectionReason : `${p.plate} · ${p.vehicleDetail}`}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                p.status === "approved"
                  ? "bg-info-soft text-info"
                  : "bg-danger-soft text-danger-text",
              )}
            >
              {p.status === "approved" ? "Approved" : "Sent back"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
