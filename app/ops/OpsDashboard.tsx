"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { LiveMap } from "@/components/map/LiveMap";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";
import { DEFAULT_CENTER } from "@/lib/geo";
import { TIER_RATES, RIDE_TIERS } from "@/lib/fares";
import { MAX_RESOLUTION_NOTE, minutesAgo, OPS_POLL_MS, PROMO_STATE_LABELS } from "@/lib/ops";
import type { PromoState, TripTone } from "@/lib/ops";
import { useLive } from "@/lib/realtime/use-live";
import type { OpsOverview, OpsSos } from "@/lib/services/ops";
import { cn } from "@/lib/utils";

import {
  acknowledgeSosAction,
  createPromoAction,
  getOpsOverviewAction,
  resolveSosAction,
  setPromoActiveAction,
} from "./actions";

const TONES: Record<TripTone, string> = {
  live: "bg-brand-soft text-brand-text",
  done: "bg-info-soft text-info",
  cancel: "bg-muted text-muted-foreground",
  sos: "bg-danger-soft text-danger-text",
};

const PROMO_TONES: Record<PromoState, string> = {
  live: "bg-info-soft text-info",
  scheduled: "bg-warn-soft text-warn",
  ended: "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
};

const CARD = "rounded-xl border border-border bg-card";

const CARD_TITLE = "font-heading text-[17px] font-bold";

/**
 * "Ops dashboard (web)": SOS alerts, the numbers, the city, the
 * verification queue (passed in), recent trips and promo codes. Refreshes
 * every few seconds; see docs/PRD.md F10 for why it polls.
 */
export function OpsDashboard({ initial, queue }: { initial: OpsOverview; queue: React.ReactNode }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showAllSos, setShowAllSos] = useState(false);
  const [pending, startTransition] = useTransition();
  const now = new Date();
  // An alert nobody has taken is never hidden. Only ones another agent is
  // already handling fold away.
  const handledElsewhere = data.sos.filter((a) => a.status === "acknowledged" && !a.assignedToMe);
  const shownSos = showAllSos
    ? data.sos
    : data.sos.filter((a) => a.status === "open" || a.assignedToMe);

  useLive(
    null,
    () => {
      getOpsOverviewAction().then((r) => r.ok && setData(r.data));
    },
    OPS_POLL_MS,
  );

  function run(action: () => Promise<ActionResult<OpsOverview>>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
      after?.();
    });
  }

  const kpis = [
    {
      label: "Trips in progress",
      value: data.kpis.tripsInProgress,
      sub: `Updates every ${OPS_POLL_MS / 1000} seconds`,
      tone: "",
    },
    { label: "Pilots online", value: data.kpis.pilotsOnline, sub: "Across all vehicles", tone: "" },
    {
      label: "Open SOS alerts",
      value: data.kpis.openSos,
      sub: data.kpis.oldestSosAt
        ? `Oldest: ${minutesAgo(data.kpis.oldestSosAt, now)}`
        : "All clear",
      tone: data.kpis.openSos > 0 ? "text-danger-text" : "",
    },
    {
      label: "Pending verifications",
      value: data.kpis.pendingVerifications,
      sub: "Pilot applications to review",
      tone: data.kpis.pendingVerifications > 0 ? "text-brand-text" : "",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-text"
        >
          {error}
        </p>
      )}

      {shownSos.map((alert) => (
        <SosBanner
          key={alert.alertId}
          alert={alert}
          now={now}
          pending={pending}
          onAcknowledge={() => run(() => acknowledgeSosAction({ alertId: alert.alertId }))}
          onResolve={(note, done) =>
            run(() => resolveSosAction({ alertId: alert.alertId, note }), done)
          }
        />
      ))}

      {handledElsewhere.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAllSos((v) => !v)}
          className="self-start text-sm font-bold text-danger-text hover:underline"
        >
          {showAllSos
            ? "Hide alerts other agents are handling"
            : `Show ${handledElsewhere.length} handled by other agents`}
        </button>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={cn(CARD, "flex flex-col gap-1.5 p-[18px]")}>
            <span className="text-[13px] font-semibold text-muted-foreground">{k.label}</span>
            <span
              className={cn("font-heading text-3xl font-bold tracking-tight", k.tone)}
              data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {k.value}
            </span>
            <span className="text-xs text-muted-foreground">{k.sub}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-stretch gap-5">
        <section
          id="map"
          aria-labelledby="map-h"
          className={cn(
            CARD,
            "flex min-w-0 flex-[999_1_560px] flex-col self-start overflow-hidden",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-[18px] py-3.5">
            <h2 id="map-h" className={CARD_TITLE}>
              Live city view · Bengaluru
            </h2>
            <div className="flex gap-3 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] border-2 border-ink bg-white" />
                Pilot
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-primary" />
                Trip in progress
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-danger-text" />
                SOS
              </span>
            </div>
          </div>
          <div className="relative h-[420px]">
            <LiveMap center={DEFAULT_CENTER} fleet={data.fleet} />
          </div>
        </section>
        <div id="pilots" className="flex max-h-[474px] min-w-0 flex-[1_1_340px] flex-col">
          {queue}
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <section
          id="trips"
          aria-labelledby="trips-h"
          className={cn(CARD, "min-w-0 flex-[999_1_560px] overflow-hidden")}
        >
          <h2 id="trips-h" className={cn(CARD_TITLE, "border-b border-border px-[18px] py-3.5")}>
            Recent trips
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wider text-muted-foreground uppercase">
                  <th className="px-[18px] py-2.5 font-bold">Trip</th>
                  <th className="px-2 py-2.5 font-bold">Rider</th>
                  <th className="px-2 py-2.5 font-bold">Pilot</th>
                  <th className="px-2 py-2.5 font-bold">Status</th>
                  <th className="px-[18px] py-2.5 text-right font-bold">Fare</th>
                </tr>
              </thead>
              <tbody>
                {data.trips.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-[18px] py-6 text-muted-foreground">
                      No trips yet.
                    </td>
                  </tr>
                )}
                {data.trips.map((t) => (
                  <tr key={t.rideId} className="border-t border-border">
                    <td className="px-[18px] py-3 font-semibold">{t.ref}</td>
                    <td className="px-2 py-3">{t.rider}</td>
                    <td className="px-2 py-3">{t.pilot}</td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
                          TONES[t.tone],
                        )}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-[18px] py-3 text-right font-semibold">{t.fare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <PromoPanel
          promos={data.promos}
          pending={pending}
          error={error}
          onToggle={(promoId, active) => run(() => setPromoActiveAction({ promoId, active }))}
          onCreate={(input, done) => run(() => createPromoAction(input), done)}
        />
      </div>
    </div>
  );
}

function SosBanner({
  alert,
  now,
  pending,
  onAcknowledge,
  onResolve,
}: {
  alert: OpsSos;
  now: Date;
  pending: boolean;
  onAcknowledge: () => void;
  onResolve: (note: string, done: () => void) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const who = alert.raisedBy === "rider" ? alert.rider : `Pilot ${alert.pilot}`;

  return (
    <section
      aria-label={`SOS from ${who}`}
      role="alert"
      className="flex flex-col gap-3 rounded-xl bg-[#C8281C] px-5 py-4 text-white"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-2 text-[13px] font-bold tracking-wider uppercase">
          <span className="size-2.5 rounded-full bg-white motion-safe:animate-pulse" />
          {alert.status === "open" ? "SOS active" : "SOS · in hand"} ·{" "}
          {minutesAgo(alert.createdAt, now)}
        </span>
        <span className="min-w-0 flex-[1_1_320px] text-base">
          <b>{who}</b>
          {alert.raisedBy === "rider" && alert.pilot ? ` on trip with ${alert.pilot}` : ""}
          {alert.plate ? ` · ${alert.plate}` : ""} · {alert.where} · {alert.tripRef}
          {alert.reason ? ` · ${alert.reason}` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {alert.status === "acknowledged" && !alert.assignedToMe && (
            <span className="text-sm font-semibold">With {alert.assignedTo}</span>
          )}
          {(alert.status === "open" || !alert.assignedToMe) && (
            <button
              type="button"
              disabled={pending}
              onClick={onAcknowledge}
              className="h-10 rounded-[10px] bg-white px-4 text-sm font-bold text-[#C8281C]"
            >
              {alert.status === "open" ? "Assign to me" : "Take over"}
            </button>
          )}
          {alert.assignedToMe && !resolving && (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="h-10 rounded-[10px] border border-white/60 px-4 text-sm font-bold"
            >
              Resolve
            </button>
          )}
        </span>
      </div>
      {resolving && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onResolve(note, () => setResolving(false));
          }}
        >
          <label htmlFor={`note-${alert.alertId}`} className="text-sm font-semibold">
            What happened, and how was it resolved?
          </label>
          <textarea
            id={`note-${alert.alertId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_RESOLUTION_NOTE}
            rows={2}
            className="rounded-md bg-white p-3 text-sm text-ink outline-none"
          />
          <span className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-[10px] bg-white px-4 text-sm font-bold text-[#C8281C]"
            >
              Mark resolved
            </button>
            <button
              type="button"
              onClick={() => setResolving(false)}
              className="h-10 rounded-[10px] border border-white/60 px-4 text-sm font-bold"
            >
              Cancel
            </button>
          </span>
        </form>
      )}
      <span className="text-xs text-white/80">
        Comet is a demo: no one is called. Real ops would phone the rider and Pilot from here.
      </span>
    </section>
  );
}

function PromoPanel({
  promos,
  pending,
  error,
  onToggle,
  onCreate,
}: {
  promos: OpsOverview["promos"];
  pending: boolean;
  error: string | null;
  onToggle: (promoId: string, active: boolean) => void;
  onCreate: (input: Record<string, unknown>, done: () => void) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section
      id="promos"
      aria-labelledby="promos-h"
      className={cn(CARD, "min-w-0 flex-[1_1_340px]")}
    >
      <div className="flex items-center justify-between border-b border-border px-[18px] py-3.5">
        <h2 id="promos-h" className={CARD_TITLE}>
          Promo campaigns
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-[34px] items-center gap-1 rounded-sm bg-primary px-3 text-[13px] font-bold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          New code
        </button>
      </div>
      <ul>
        {promos.map((p) => (
          <li
            key={p.promoId}
            aria-label={`Promo ${p.code}`}
            className="flex items-center gap-3 border-b border-border px-[18px] py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-heading text-sm font-bold tracking-wider">{p.code}</span>
              <span className="text-xs text-muted-foreground">{p.title}</span>
              <span className="text-xs text-muted-foreground">{p.terms}</span>
            </span>
            <span className="text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
              {p.uses} {p.uses === 1 ? "use" : "uses"}
            </span>
            <span
              className={cn("rounded-full px-2.5 py-1 text-xs font-bold", PROMO_TONES[p.state])}
            >
              {PROMO_STATE_LABELS[p.state]}
            </span>
            {p.state !== "ended" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onToggle(p.promoId, !p.isActive)}
                aria-label={`${p.isActive ? "Switch off" : "Switch on"} ${p.code}`}
                className="text-xs font-bold text-info hover:underline"
              >
                {p.isActive ? "Switch off" : "Switch on"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {creating && (
        <NewPromoDialog
          pending={pending}
          error={error}
          onClose={() => setCreating(false)}
          onCreate={(input) => onCreate(input, () => setCreating(false))}
        />
      )}
    </section>
  );
}

const FIELD =
  "h-11 w-full rounded-md border-2 border-border bg-card px-3 text-sm outline-none focus:border-primary";

/** Today and 30 days on, as datetime-local values in India time. */
function defaultWindow() {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(d)
      .replace(" ", "T");
  const now = new Date();
  return { start: fmt(now), end: fmt(new Date(now.getTime() + 30 * 86_400_000)) };
}

function NewPromoDialog({
  pending,
  error,
  onClose,
  onCreate,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<"flat" | "percent" | "cashback">("flat");
  const range = defaultWindow();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    // Times are typed in India time.
    const ist = (v: string) => (v ? `${v}:00+05:30` : v);
    onCreate({
      code: f.code,
      kind,
      amount: f.amount,
      capRupees: f.cap ? f.cap : null,
      minFareRupees: f.minFare || 0,
      tier: f.tier || null,
      title: f.title,
      startsAt: ist(f.startsAt ?? ""),
      endsAt: ist(f.endsAt ?? ""),
      maxUsesPerUser: f.uses || 1,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-promo-h"
        className="flex max-h-[90dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-3xl bg-background"
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <h2 id="new-promo-h" className="flex-1 font-heading text-[22px] font-bold tracking-tight">
            New promo code
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-card"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 overflow-y-auto px-5 pb-6">
          <label className="col-span-2 flex flex-col gap-1 text-[13px] font-semibold">
            Code
            <input name="code" required maxLength={20} className={cn(FIELD, "uppercase")} />
          </label>
          <fieldset className="col-span-2 flex flex-col gap-1">
            <legend className="text-[13px] font-semibold">Type</legend>
            <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
              {(
                [
                  ["flat", "₹ off"],
                  ["percent", "% off"],
                  ["cashback", "% cashback"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={kind === id}
                  onClick={() => setKind(id)}
                  className={cn(
                    "min-h-9 rounded-sm text-sm font-bold",
                    kind === id ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {kind === "flat" ? "Discount (₹)" : "Percent"}
            <input name="amount" type="number" min={1} required className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Cap (₹, optional)
            <input name="cap" type="number" min={0} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Minimum fare (₹)
            <input name="minFare" type="number" min={0} defaultValue={0} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Ride type
            <select name="tier" defaultValue="" className={FIELD}>
              <option value="">Any</option>
              {RIDE_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_RATES[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-[13px] font-semibold">
            What riders see
            <input name="title" required maxLength={120} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Starts (India time)
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={range.start}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Ends (India time)
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={range.end}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Uses per rider
            <input name="uses" type="number" min={1} max={10} defaultValue={1} className={FIELD} />
          </label>
          {kind === "cashback" && (
            <p className="col-span-2 text-xs text-muted-foreground">
              Cashback is credited only when the ride is paid from Comet Wallet.
            </p>
          )}
          {error && (
            <p role="alert" className="col-span-2 text-sm font-semibold text-danger-text">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="col-span-2 h-12 rounded-lg text-base font-bold"
          >
            {pending ? "Creating…" : "Create code"}
          </Button>
        </form>
      </section>
    </div>
  );
}
