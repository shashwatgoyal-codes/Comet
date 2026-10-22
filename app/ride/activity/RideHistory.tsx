"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TIER_RATES } from "@/lib/fares";
import { formatRupees } from "@/lib/money";
import type { HistoryItem, HistoryTab } from "@/lib/services/history";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/wallet";

import { listRidesAction } from "../actions";

type Page = { items: HistoryItem[]; nextCursor: string | null };

const TABS: { id: HistoryTab; label: string }[] = [
  { id: "past", label: "Past" },
  { id: "upcoming", label: "Upcoming" },
  { id: "cancelled", label: "Cancelled" },
];

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const month = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

function statusLine(r: HistoryItem): string {
  if (r.status === "scheduled") return "Booked ahead · Pilot assigned 15 min before";
  if (r.status === "completed") {
    return r.paymentStatus === "paid"
      ? `Completed · ${PAYMENT_METHOD_LABELS[r.paymentMethod as PaymentMethod]}`
      : "Completed · payment due";
  }
  if (r.status === "expired") return "No Pilot found · not charged";
  const who =
    r.status === "no_show"
      ? "No-show"
      : r.cancelledBy === "rider"
        ? "Cancelled by you"
        : "Cancelled";
  if (r.cancellationFeePaise === 0) return `${who} · no charge`;
  return r.paymentStatus === "paid"
    ? `${who} · ${formatRupees(r.cancellationFeePaise)} fee`
    : `${who} · fee waived`;
}

/** The route as a tiny line drawing, scaled into a 56×56 tile. */
function Sketch({ points, muted }: { points: [number, number][]; muted: boolean }) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const d = points
    .map(([x, y], i) => {
      const px = 8 + ((x - minX) / span) * 40;
      const py = 48 - ((y - minY) / span) * 40;
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0 rounded-md">
      <rect width="56" height="56" rx="12" fill="var(--map-land, var(--muted))" />
      <path
        d="M0 20H56M0 40H56M18 0V56M40 0V56"
        stroke="var(--map-road, var(--card))"
        strokeWidth="3"
      />
      <path
        d={d}
        fill="none"
        stroke={muted ? "var(--muted-foreground)" : "var(--primary)"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RideHistory({ initial, initialTab }: { initial: Page; initialTab: HistoryTab }) {
  const [tab, setTab] = useState<HistoryTab>(initialTab);
  const [pages, setPages] = useState<Record<HistoryTab, Page | null>>({
    past: null,
    upcoming: null,
    cancelled: null,
    [initialTab]: initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const page = pages[tab];

  function load(which: HistoryTab, cursor: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await listRidesAction({ tab: which, cursor });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPages((all) => ({
        ...all,
        [which]: cursor
          ? {
              items: [...(all[which]?.items ?? []), ...result.data.items],
              nextCursor: result.data.nextCursor,
            }
          : result.data,
      }));
    });
  }

  function pick(next: HistoryTab) {
    setTab(next);
    if (!pages[next]) load(next, null);
  }

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="px-5 pt-6 pb-3 font-heading text-[22px] font-bold tracking-tight">
        Your rides
      </h1>
      <div
        role="tablist"
        aria-label="Ride filter"
        className="mx-5 grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cn(
              "h-10 rounded-sm text-sm font-bold",
              tab === t.id ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === tab)!.label}
        className="flex flex-1 flex-col gap-2.5 px-5 py-3"
      >
        {!page ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : page.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-10 text-center text-muted-foreground">
            <CalendarDays className="size-12" strokeWidth={1.6} aria-hidden />
            <span className="text-base font-bold text-foreground">No rides here yet</span>
            <span className="text-sm">
              {tab === "upcoming"
                ? "Scheduled rides will show up here."
                : "Your trips will show up here."}
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5" aria-label="Rides">
            {page.items.map((r, i) => {
              const header = month.format(new Date(r.at));
              const showHeader =
                i === 0 || month.format(new Date(page.items[i - 1]!.at)) !== header;
              const ended = r.status !== "completed" && r.status !== "scheduled";
              return (
                <li key={r.id} className="flex flex-col gap-1.5">
                  {showHeader && (
                    <span className="pt-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
                      {header}
                    </span>
                  )}
                  <Link
                    href={`/ride/activity/${r.id}`}
                    className="flex items-center gap-3 rounded-lg bg-card p-3"
                  >
                    <Sketch points={r.sketch} muted={ended} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold">{r.drop}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {when.format(new Date(r.at))} · {TIER_RATES[r.tier].label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          ended
                            ? "text-danger-text"
                            : r.status === "scheduled"
                              ? "text-info"
                              : "text-muted-foreground",
                        )}
                      >
                        {statusLine(r)}
                      </span>
                    </span>
                    <span className="font-heading text-[15px] font-bold">
                      {formatRupees(r.totalPaise)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}
        {page?.nextCursor && (
          <Button
            variant="outline"
            onClick={() => load(tab, page.nextCursor)}
            disabled={pending}
            className="h-12 rounded-lg font-bold"
          >
            {pending ? "Loading…" : "Show older rides"}
          </Button>
        )}
      </section>
    </main>
  );
}
