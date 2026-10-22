import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { SafetyPinCard } from "@/components/safety/SafetyPinCard";
import { ThemePicker } from "@/components/ThemePicker";
import { requireUser } from "@/lib/auth/session";
import { listContacts } from "@/lib/services/contacts";
import { hasSafetyPin } from "@/lib/services/sos";

import { DangerZone, EmergencyContacts, HideLastName } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

const heading = "text-xs font-bold tracking-widest text-muted-foreground uppercase";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ta", label: "தமிழ்" },
];

/** "17 · Settings". */
export default async function SettingsPage() {
  const user = await requireUser("/ride/account/settings");
  const [contacts, pin] = await Promise.all([listContacts(user.id), hasSafetyPin(user.id)]);
  return (
    <AppShell app="rider" active="/ride/account" layout="page" initial={user.displayName[0]}>
      <main className="flex min-h-dvh flex-col gap-5 px-5 pt-6 pb-8 md:mx-auto md:min-h-0 md:max-w-[640px] md:px-0 md:pt-0">
        <div className="flex items-center gap-3">
          <Link
            href="/ride/account"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-card"
          >
            <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
          </Link>
          <h1 className="font-heading text-[22px] font-bold tracking-tight">Settings</h1>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="lang-h">
          <h2 id="lang-h" className={heading}>
            Language
          </h2>
          <div className="grid grid-cols-4 gap-1.5">
            {LANGUAGES.map((l) => (
              <span
                key={l.code}
                lang={l.code}
                aria-current={l.code === "en" ? "true" : undefined}
                className={
                  l.code === "en"
                    ? "flex h-12 items-center justify-center rounded-md border-2 border-primary bg-brand-soft text-sm font-bold"
                    : "flex h-12 items-center justify-center rounded-md bg-card text-sm font-bold text-muted-foreground"
                }
              >
                {l.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">More languages are coming soon.</p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="theme-h">
          <h2 id="theme-h" className={heading}>
            Appearance
          </h2>
          <ThemePicker />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="sos-h">
          <h2 id="sos-h" className={heading}>
            Emergency contacts
          </h2>
          <EmergencyContacts initial={contacts} />
          <SafetyPinCard hasPin={pin} isDemo={user.isDemo} />
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="privacy-h">
          <h2 id="privacy-h" className={heading}>
            Privacy
          </h2>
          <HideLastName initial={user.hideLastName} />
        </section>

        <DangerZone />
      </main>
    </AppShell>
  );
}
