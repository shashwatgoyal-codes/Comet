import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { requireUser } from "@/lib/auth/session";
import { getPilotCurrentRide, getPilotStatus } from "@/lib/services/pilots";
import { getOpenSos } from "@/lib/services/sos";

import { PilotTrip } from "./PilotTrip";

export const metadata: Metadata = { title: "Current ride" };

export default async function PilotTripPage() {
  const user = await requireUser("/pilot/trip");
  const ride = await getPilotCurrentRide(user.id);
  if (!ride) redirect("/pilot");
  return (
    <AppShell app="pilot" active="/pilot" layout="map" initial={user.displayName[0]}>
      <PilotTrip
        // A new ride (a queued one released) starts the screen afresh.
        key={ride.id}
        initial={ride}
        initialChainRequests={(await getPilotStatus(user.id)).chainRequests}
        initialSos={await getOpenSos(user.id, ride.id)}
        isDemoUser={user.isDemo}
      />
    </AppShell>
  );
}
