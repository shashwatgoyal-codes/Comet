import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/auth/session";
import { listPlaces } from "@/lib/services/places";

import { SavedPlaces } from "./SavedPlaces";

export const metadata: Metadata = { title: "Saved places" };

/** "14 · Saved places". */
export default async function SavedPlacesPage() {
  const user = await requireUser("/ride/account/places");
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
          <h1 className="font-heading text-[22px] font-bold tracking-tight">Saved places</h1>
        </div>
        <SavedPlaces initial={await listPlaces(user.id)} />
      </main>
    </AppShell>
  );
}
