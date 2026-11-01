import type { Metadata } from "next";

import { requireOpsPage } from "@/lib/auth/ops";
import { listPilotApplications } from "@/lib/services/onboarding";
import { getOpsOverview } from "@/lib/services/ops";

import { OpsDashboard } from "./OpsDashboard";
import { OpsHeader } from "./OpsHeader";
import { PilotQueue } from "./PilotQueue";

export const metadata: Metadata = { title: "Comet Ops" };

/** "Ops dashboard (web)" (docs/UX_FLOWS.md Flow 13). Allowlisted accounts only. */
export default async function OpsPage() {
  const user = await requireOpsPage("/ops");
  const [applications, overview] = await Promise.all([
    listPilotApplications(),
    getOpsOverview(user.id),
  ]);
  const initials = user.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div id="top" className="min-h-dvh bg-background">
      <OpsHeader initials={initials} />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 p-6">
        <h1 className="sr-only">Comet Ops</h1>
        <OpsDashboard initial={overview} queue={<PilotQueue initial={applications} />} />
      </main>
    </div>
  );
}
