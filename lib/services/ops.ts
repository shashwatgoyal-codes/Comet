import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type PromoKind, type RideTier } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { LatLng } from "@/lib/geo";
import { log } from "@/lib/log";
import { formatRupees } from "@/lib/money";
import {
  promoState,
  RECENT_TRIPS,
  shortName,
  tripRef,
  tripStatus,
  type PromoState,
  type TripTone,
} from "@/lib/ops";
import { promoTerms } from "@/lib/promos";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { ACTIVE_STATUSES } from "@/lib/ride-state";
import { LOCATION_FRESH_S } from "@/lib/services/matching";
import { toRule } from "@/lib/services/promos";

/**
 * The ops dashboard (docs/PRD.md F10, docs/UX_FLOWS.md Flow 13). Only ops
 * Server Actions call this module, after checking the ops role; it reads
 * across every account, which no other service does.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export type OpsSos = {
  alertId: string;
  rideId: string;
  tripRef: string;
  raisedBy: "rider" | "pilot";
  reason: string | null;
  status: "open" | "acknowledged";
  createdAt: string;
  rider: string;
  pilot: string | null;
  plate: string | null;
  where: string;
  point: LatLng | null;
  assignedTo: string | null;
  assignedToMe: boolean;
};

export type OpsTrip = {
  rideId: string;
  ref: string;
  rider: string;
  pilot: string;
  status: string;
  tone: TripTone;
  fare: string;
  requestedAt: string;
};

export type OpsPromo = {
  promoId: string;
  code: string;
  title: string;
  terms: string;
  uses: number;
  state: PromoState;
  isActive: boolean;
};

export type OpsOverview = {
  kpis: {
    tripsInProgress: number;
    pilotsOnline: number;
    openSos: number;
    oldestSosAt: string | null;
    pendingVerifications: number;
  };
  sos: OpsSos[];
  fleet: { id: string; point: LatLng; kind: "pilot" | "trip" | "sos" }[];
  trips: OpsTrip[];
  promos: OpsPromo[];
};

const SOS_REASONS: Record<string, string> = {
  rider_unsafe: "Feels unsafe",
  accident: "Accident",
  medical: "Medical",
  vehicle: "Vehicle problem",
  other: "Other",
};

/**
 * Online the way matching sees it: switched on, with a position from the
 * last minute. A phone that went quiet doesn't count.
 */
async function onlinePilots(now: Date) {
  const since = new Date(now.getTime() - LOCATION_FRESH_S * 1000);
  return db.$queryRaw<{ pilot_id: string; lat: number; lng: number }[]>`
    SELECT pilot_id, ST_Y(location_point::geometry) AS lat, ST_X(location_point::geometry) AS lng
      FROM pilot_locations WHERE is_online AND updated_at >= ${since}`;
}

export async function getOpsOverview(opsId: string, now = new Date()): Promise<OpsOverview> {
  const [alerts, activeRides, pilots, recent, promos, pendingVerifications] = await Promise.all([
    db.sosAlert.findMany({
      where: { status: { not: "resolved" } },
      orderBy: { createdAt: "asc" },
      include: {
        ride: { include: { rider: true, pilot: { include: { pilotProfile: true } } } },
      },
    }),
    db.ride.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] }, pilotId: { not: null } },
      select: { pilotId: true },
    }),
    onlinePilots(now),
    db.ride.findMany({
      orderBy: { requestedAt: "desc" },
      take: RECENT_TRIPS,
      include: {
        rider: true,
        pilot: true,
        sosAlerts: { where: { status: { not: "resolved" } }, select: { id: true } },
      },
    }),
    db.promoCode.findMany({
      orderBy: [{ isActive: "desc" }, { endsAt: "desc" }],
      include: {
        _count: {
          select: {
            redemptions: { where: { ride: { status: { notIn: ["cancelled", "expired"] } } } },
          },
        },
      },
    }),
    db.pilotProfile.count({ where: { status: "pending", submittedAt: { not: null } } }),
  ]);

  const assignees = await db.user.findMany({
    where: { id: { in: alerts.map((a) => a.assignedTo).filter((v): v is string => !!v) } },
    select: { id: true, displayName: true },
  });
  const onTrip = new Set(activeRides.map((r) => r.pilotId));

  const sos: OpsSos[] = alerts.map((a) => ({
    alertId: a.id,
    rideId: a.rideId,
    tripRef: tripRef(a.rideId),
    raisedBy: a.raisedByRole,
    reason: a.reason ? (SOS_REASONS[a.reason] ?? null) : null,
    status: a.status === "acknowledged" ? "acknowledged" : "open",
    createdAt: a.createdAt.toISOString(),
    rider: `${firstName(a.ride.rider.displayName)} (${a.ride.rider.cometId})`,
    pilot: a.ride.pilot ? a.ride.pilot.displayName : null,
    plate: a.ride.pilot?.pilotProfile?.plate ?? null,
    where: a.ride.status === "in_progress" ? `To ${a.ride.dropAddress}` : a.ride.pickupAddress,
    point: a.lastLat !== null && a.lastLng !== null ? { lat: a.lastLat, lng: a.lastLng } : null,
    assignedTo: assignees.find((u) => u.id === a.assignedTo)?.displayName ?? null,
    assignedToMe: a.assignedTo === opsId,
  }));

  return {
    kpis: {
      tripsInProgress: activeRides.length,
      pilotsOnline: pilots.length,
      openSos: sos.length,
      oldestSosAt: sos[0]?.createdAt ?? null,
      pendingVerifications,
    },
    sos,
    fleet: [
      ...pilots.map((p) => ({
        id: p.pilot_id,
        point: { lat: p.lat, lng: p.lng },
        kind: onTrip.has(p.pilot_id) ? ("trip" as const) : ("pilot" as const),
      })),
      ...sos.flatMap((s) =>
        s.point ? [{ id: s.alertId, point: s.point, kind: "sos" as const }] : [],
      ),
    ],
    trips: recent.map((r) => {
      const { label, tone } = tripStatus(r.status, r.sosAlerts.length > 0);
      return {
        rideId: r.id,
        ref: tripRef(r.id),
        rider: `${firstName(r.rider.displayName)} · ${r.rider.cometId}`,
        pilot: r.pilot ? shortName(r.pilot.displayName) : "—",
        status: label,
        tone,
        fare: formatRupees(
          r.status === "completed" ? r.totalPaise + r.tipPaise : r.cancellationFeePaise,
        ),
        requestedAt: r.requestedAt.toISOString(),
      };
    }),
    promos: promos.map((p) => ({
      promoId: p.id,
      code: p.code,
      title: p.title,
      terms: promoTerms(toRule(p)),
      uses: p._count.redemptions,
      state: promoState(p, now),
      isActive: p.isActive,
    })),
  };
}

const auditEntry = (
  opsId: string,
  action: string,
  targetType: string,
  targetId: string,
  data: Prisma.InputJsonObject = {},
) => db.opsAuditLog.create({ data: { actorId: opsId, action, targetType, targetId, data } });

/** "Assign to me": takes the alert and acknowledges it. A second ops member can take it over. */
export async function acknowledgeSos(opsId: string, alertId: string, now = new Date()) {
  const [alert] = await db.$queryRaw<{ rideId: string }[]>`
    WITH s AS (
      UPDATE sos_alerts
         SET status = 'acknowledged', assigned_to = ${opsId}::uuid, acknowledged_at = ${now}
       WHERE id = ${alertId}::uuid AND status <> 'resolved'
      RETURNING id, ride_id
    ), a AS (
      INSERT INTO ops_audit_log (id, actor_id, action, target_type, target_id)
      SELECT gen_random_uuid(), ${opsId}::uuid, 'sos.acknowledge', 'sos_alert', id FROM s
      RETURNING id
    )
    SELECT ride_id AS "rideId" FROM s`;
  if (!alert) throw new AppError("CONFLICT", "This alert has already been resolved.");
  log.info("ops.sos_acknowledged");
  await broadcast(
    {
      topic: topics.ops,
      event: EVENTS.sosUpdated,
      payload: { alertId, rideId: alert.rideId, status: "acknowledged" },
    },
    {
      topic: topics.ride(alert.rideId),
      event: EVENTS.sosUpdated,
      payload: { alertId, status: "acknowledged" },
    },
  );
}

/** Resolve with a note. Only whoever has the alert can close it. */
export async function resolveSos(opsId: string, alertId: string, note: string, now = new Date()) {
  const [alert] = await db.$queryRaw<{ rideId: string }[]>`
    WITH s AS (
      UPDATE sos_alerts
         SET status = 'resolved', resolved_at = ${now}, resolution_note = ${note}
       WHERE id = ${alertId}::uuid AND status = 'acknowledged' AND assigned_to = ${opsId}::uuid
      RETURNING id, ride_id
    ), a AS (
      INSERT INTO ops_audit_log (id, actor_id, action, target_type, target_id, data)
      SELECT gen_random_uuid(), ${opsId}::uuid, 'sos.resolve', 'sos_alert', id,
             jsonb_build_object('note', ${note}::text)
        FROM s
      RETURNING id
    )
    SELECT ride_id AS "rideId" FROM s`;
  if (!alert) {
    throw new AppError("CONFLICT", "Assign this alert to yourself before resolving it.");
  }
  log.info("ops.sos_resolved");
  await broadcast(
    {
      topic: topics.ops,
      event: EVENTS.sosUpdated,
      payload: { alertId, rideId: alert.rideId, status: "resolved" },
    },
    {
      topic: topics.ride(alert.rideId),
      event: EVENTS.sosUpdated,
      payload: { alertId, status: "resolved" },
    },
  );
}

export type NewPromo = {
  code: string;
  kind: PromoKind;
  /** Paise for flat, hundredths of a percent otherwise (2000 = 20%). */
  value: number;
  maxDiscountPaise: number | null;
  minFarePaise: number;
  tier: RideTier | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  maxUsesPerUser: number;
};

export async function createPromo(opsId: string, input: NewPromo) {
  const id = randomUUID();
  try {
    await db.$transaction([
      db.promoCode.create({
        data: { id, ...input, walletOnly: input.kind === "cashback", isActive: true },
      }),
      auditEntry(opsId, "promo.create", "promo_code", id, { code: input.code }),
    ]);
    log.info("ops.promo_created", { kind: input.kind });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", `${input.code} already exists. Choose another code.`);
    }
    throw err;
  }
}

/** Switch a code off (or back on). Rides already booked with it keep their discount. */
export async function setPromoActive(opsId: string, promoId: string, active: boolean) {
  // Codes are never deleted, so checking first can't race with a delete.
  if (!(await db.promoCode.findUnique({ where: { id: promoId }, select: { id: true } }))) {
    throw new AppError("NOT_FOUND", "That promo code doesn't exist.");
  }
  await db.$transaction([
    db.promoCode.update({ where: { id: promoId }, data: { isActive: active } }),
    auditEntry(opsId, active ? "promo.activate" : "promo.deactivate", "promo_code", promoId),
  ]);
}
