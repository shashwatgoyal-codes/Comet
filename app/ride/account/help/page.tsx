import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/auth/session";
import { listRides } from "@/lib/services/history";

import { HelpCenter } from "./HelpCenter";

export const metadata: Metadata = { title: "Help" };

/** "16 · Help & support". */
export default async function HelpPage() {
  const user = await requireUser("/ride/account/help");
  const lastTrip = (await listRides(user.id, "past", null)).items[0] ?? null;
  return (
    <AppShell app="rider" active="/ride/account" layout="page" initial={user.displayName[0]}>
      <main className="flex min-h-dvh flex-col gap-4 px-5 pt-6 pb-8 md:mx-auto md:min-h-0 md:max-w-[640px] md:px-0 md:pt-0">
        <div className="flex items-center gap-3">
          <Link
            href="/ride/account"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-card"
          >
            <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
          </Link>
          <h1 className="font-heading text-[22px] font-bold tracking-tight">Help</h1>
        </div>
        <HelpCenter lastTrip={lastTrip} cometId={user.cometId} />
      </main>
    </AppShell>
  );
}
