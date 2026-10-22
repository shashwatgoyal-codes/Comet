import Link from "next/link";

import { CometLogo } from "@/components/icons/CometMark";
import { OfflineBanner } from "@/components/OfflineBanner";
import { cn } from "@/lib/utils";

/**
 * The frame every signed-in rider and Pilot screen lives in
 * (docs/DESIGN_SYSTEM.md §14, "Desktop web app" artboards).
 *
 * - Phones (< 768px): the 430px phone column, as before, with the bottom
 *   tab bar each screen renders.
 * - From 768px: a top navigation bar, then either a full-width map screen
 *   (`layout="map"`, whose sheet becomes a floating left panel) or a
 *   centred content page (`layout="page"`).
 */

type App = "rider" | "pilot";

const NAV: Record<App, { href: string; label: string }[]> = {
  rider: [
    { href: "/ride", label: "Ride" },
    { href: "/ride/activity", label: "Activity" },
    { href: "/ride/wallet", label: "Wallet" },
    { href: "/ride/account", label: "Account" },
  ],
  pilot: [
    { href: "/pilot", label: "Drive" },
    { href: "/pilot/earnings", label: "Earnings" },
    { href: "/pilot/account", label: "Account" },
  ],
};

export function AppShell({
  app,
  active,
  layout,
  initial,
  children,
}: {
  app: App;
  /** The nav item for this screen, e.g. "/ride/wallet". */
  active: string;
  layout: "map" | "page";
  /** The account initial for the avatar link. */
  initial?: string;
  children: React.ReactNode;
}) {
  const pilot = app === "pilot";
  return (
    <div className="min-h-dvh bg-background">
      <OfflineBanner />
      <header
        className={cn(
          "hidden h-16 items-center gap-6 border-b px-6 md:flex",
          pilot ? "border-transparent bg-ink text-on-ink" : "border-border bg-card",
        )}
      >
        <Link href={pilot ? "/pilot" : "/ride"} aria-label="Comet home">
          <CometLogo suffix={pilot ? "pilot" : undefined} />
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {NAV[app].map((item) => {
            const on = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-md px-3.5 text-[15px]",
                  on
                    ? pilot
                      ? "bg-ink-raised font-bold"
                      : "bg-brand-soft font-bold text-brand-text"
                    : pilot
                      ? "font-semibold text-ink-muted hover:text-on-ink"
                      : "font-semibold text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="flex-1" />
        {initial && (
          <Link
            href={pilot ? "/pilot/account" : "/ride/account"}
            aria-label="Account"
            className="flex size-10 items-center justify-center rounded-full bg-primary font-heading font-bold text-primary-foreground"
          >
            {initial}
          </Link>
        )}
      </header>
      <div
        className={cn(
          "mx-auto w-full max-w-[430px] bg-background sm:shadow-float md:shadow-none",
          layout === "map" ? "md:max-w-none" : "md:max-w-[1080px] md:px-6 md:py-8",
        )}
      >
        {children}
      </div>
    </div>
  );
}
