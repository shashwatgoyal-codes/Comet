"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * "State · Offline": shown while the browser has no connection. A ride in
 * progress carries on; screens catch up by themselves when it's back.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-[420px] items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-on-ink shadow-float md:top-20"
    >
      <WifiOff className="size-5 shrink-0 text-ink-accent" aria-hidden />
      <span>
        <b>You&apos;re offline.</b> Your ride continues — Comet reconnects and updates as soon as
        you&apos;re back.
      </span>
    </div>
  );
}
