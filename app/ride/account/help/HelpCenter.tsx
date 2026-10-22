"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatRupees } from "@/lib/money";
import type { HistoryItem } from "@/lib/services/history";

import { HELP_TOPICS } from "./topics";

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function HelpCenter({
  lastTrip,
  cometId,
}: {
  lastTrip: HistoryItem | null;
  cometId: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const topics = HELP_TOPICS.map((t) => ({
    ...t,
    questions: q
      ? t.questions.filter((x) => `${x.q} ${x.a} ${t.title}`.toLowerCase().includes(q))
      : t.questions,
  })).filter((t) => t.questions.length > 0);

  return (
    <>
      <label className="flex h-[50px] items-center gap-2.5 rounded-md bg-card px-3.5">
        <Search className="size-5 text-muted-foreground" aria-hidden />
        <span className="sr-only">Search help</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search refunds, fees, safety…"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
      </label>

      {lastTrip && !q && (
        <section
          className="flex flex-col gap-2.5 rounded-xl bg-card p-3.5"
          aria-labelledby="last-trip"
        >
          <h2
            id="last-trip"
            className="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Your last trip
          </h2>
          <Link
            href={`/ride/activity/${lastTrip.id}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{lastTrip.drop}</span>
              <span className="text-[13px] text-muted-foreground">
                {when.format(new Date(lastTrip.at))} · {formatRupees(lastTrip.totalPaise)}
              </span>
            </span>
            <ChevronRight className="size-[18px] text-muted-foreground" aria-hidden />
          </Link>
          <div className="flex flex-wrap gap-2">
            {[
              ["#payments", "Fare or payment issue"],
              ["#cancellations", "Cancellation fee"],
              ["#lost", "Lost an item"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-semibold"
              >
                {label}
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3">
        {topics.length === 0 && (
          <p className="rounded-xl bg-card p-5 text-center text-sm text-muted-foreground">
            Nothing matches &quot;{query}&quot;. Try &quot;wallet&quot;, &quot;cancel&quot; or
            &quot;SOS&quot;.
          </p>
        )}
        {topics.map((t) => (
          <section
            key={t.id}
            id={t.id}
            aria-labelledby={`${t.id}-h`}
            className="scroll-mt-20 rounded-xl bg-card px-4 py-2"
          >
            <h2 id={`${t.id}-h`} className="py-2 font-bold">
              {t.title}
              <span className="block text-xs font-normal text-muted-foreground">{t.sub}</span>
            </h2>
            {t.questions.map((x) => (
              <details key={x.q} open={Boolean(q)} className="group border-t border-border py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
                  {x.q}
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                </summary>
                <p className="pt-2 text-sm leading-relaxed text-muted-foreground">{x.a}</p>
              </details>
            ))}
          </section>
        ))}
      </div>

      <p className="text-center text-xs leading-normal text-muted-foreground">
        Comet is a portfolio project, so there&apos;s no support team behind this page. Your Comet
        ID is {cometId}.
      </p>
    </>
  );
}
