"use client";

import { LocateFixed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LiveMap } from "@/components/map/LiveMap";
import { Button } from "@/components/ui/button";
import { useCurrentPosition } from "@/lib/use-current-position";

const SEEN_KEY = "comet-location-intro";

/**
 * The full-bleed map behind the rider home sheet, centred on the rider.
 * The first time, before the browser asks for location, "15 · Permissions"
 * explains why — and the location request waits until the rider says yes.
 */
export function HomeMap() {
  const [intro, setIntro] = useState<"checking" | "show" | "done">("checking");
  const { position } = useCurrentPosition(intro === "done");

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage blocked: just ask the browser.
    }
    if (seen || !navigator.permissions) {
      queueMicrotask(() => setIntro("done"));
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => setIntro(status.state === "prompt" ? "show" : "done"))
      .catch(() => setIntro("done"));
  }, []);

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Shown again next time; harmless.
    }
    setIntro("done");
  }

  return (
    <>
      <LiveMap center={position} you={position} bottomInset={0.55} />
      {intro === "show" && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background px-6 pt-8 pb-6 md:items-center md:justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="loc-title"
            className="flex flex-1 flex-col items-center justify-center gap-6 text-center md:max-w-[420px] md:flex-none"
          >
            <span className="flex size-[200px] items-center justify-center rounded-full bg-card">
              <LocateFixed className="size-20 text-primary" strokeWidth={1.6} aria-hidden />
            </span>
            <div className="flex flex-col gap-2.5">
              <h1
                id="loc-title"
                className="font-heading text-[26px] leading-tight font-bold tracking-tight"
              >
                Find you faster
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Comet uses your location to set your pickup point and show Pilots nearby.
              </p>
            </div>
            <ul className="flex w-full flex-col gap-2 rounded-xl bg-card p-4 text-left text-sm">
              <li>✓ Only while you use the app</li>
              <li>✓ Shared with your Pilot during a trip only</li>
              <li>✓ You can turn it off anytime in your browser</li>
            </ul>
            <div className="flex w-full flex-col gap-2.5">
              <Button onClick={finish} className="h-14 rounded-lg text-[17px] font-bold">
                Allow while using the app
              </Button>
              <Link
                href="/ride/plan"
                onClick={finish}
                className="flex h-12 items-center justify-center rounded-lg font-bold text-muted-foreground"
              >
                Enter pickup manually
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
