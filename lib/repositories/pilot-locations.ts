import "server-only";

import { db } from "@/lib/db";
import type { RideTier } from "@/lib/fares";
import type { LatLng } from "@/lib/geo";

/**
 * Live Pilot positions. PostGIS columns aren't expressible in Prisma's
 * query API, so these are raw SQL — parameterised with tagged templates,
 * never string-built.
 */

export async function upsertPilotLocation(
  pilotId: string,
  point: LatLng,
  opts: { headingDeg?: number | null; speedKmh?: number | null; isOnline: boolean },
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO pilot_locations (pilot_id, location_point, heading_deg, speed_kmh, is_online, is_available, updated_at)
    VALUES (
      ${pilotId}::uuid,
      ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
      ${opts.headingDeg ?? null}, ${opts.speedKmh ?? null}, ${opts.isOnline}, true, now()
    )
    ON CONFLICT (pilot_id) DO UPDATE SET
      location_point = EXCLUDED.location_point,
      heading_deg = EXCLUDED.heading_deg,
      speed_kmh = EXCLUDED.speed_kmh,
      is_online = EXCLUDED.is_online,
      updated_at = now()
  `;
}

export async function setPilotOnline(pilotId: string, isOnline: boolean): Promise<void> {
  await db.$executeRaw`
    UPDATE pilot_locations SET is_online = ${isOnline}, updated_at = now() WHERE pilot_id = ${pilotId}::uuid
  `;
}

export async function setPilotAvailable(pilotId: string, isAvailable: boolean): Promise<void> {
  await db.$executeRaw`
    UPDATE pilot_locations SET is_available = ${isAvailable} WHERE pilot_id = ${pilotId}::uuid
  `;
}

export type PilotLocationRow = {
  point: LatLng;
  headingDeg: number | null;
  isOnline: boolean;
  isAvailable: boolean;
  updatedAt: Date;
};

export async function getPilotLocation(pilotId: string): Promise<PilotLocationRow | null> {
  const rows = await db.$queryRaw<
    {
      lat: number;
      lng: number;
      heading_deg: number | null;
      is_online: boolean;
      is_available: boolean;
      updated_at: Date;
    }[]
  >`
    SELECT ST_Y(location_point::geometry) AS lat, ST_X(location_point::geometry) AS lng,
           heading_deg, is_online, is_available, updated_at
    FROM pilot_locations WHERE pilot_id = ${pilotId}::uuid
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    point: { lat: r.lat, lng: r.lng },
    headingDeg: r.heading_deg,
    isOnline: r.is_online,
    isAvailable: r.is_available,
    updatedAt: r.updated_at,
  };
}

export type Candidate = { pilotId: string; distanceM: number };

/**
 * The nearest eligible Pilots: online, available, approved, on the right
 * tier, with a fresh position, within the radius, nearest first. Uses the
 * partial GIST index on pilot_locations.
 */
export async function findNearestPilots(params: {
  point: LatLng;
  tier: RideTier;
  radiusM: number;
  freshSeconds: number;
  limit: number;
  excludePilotIds: string[];
  /** Only verified women Pilots (a women-only ride). */
  womenOnly?: boolean;
  /** The rider is a verified woman; Pilots in women-passengers mode may take her. */
  riderVerifiedFemale?: boolean;
  /** Whether "night only" women-passengers modes are on right now. */
  night?: boolean;
}): Promise<Candidate[]> {
  const { point, tier, radiusM, freshSeconds, limit, excludePilotIds } = params;
  const womenOnly = params.womenOnly ?? false;
  const riderFemale = params.riderVerifiedFemale ?? false;
  const night = params.night ?? false;
  const exclude = excludePilotIds.length
    ? excludePilotIds
    : ["00000000-0000-0000-0000-000000000000"];
  return db.$queryRaw<Candidate[]>`
    WITH here AS (
      SELECT ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography AS g
    )
    SELECT pl.pilot_id AS "pilotId",
           ST_Distance(pl.location_point, here.g)::float8 AS "distanceM"
    FROM pilot_locations pl
    JOIN pilot_profiles pp ON pp.user_id = pl.pilot_id
    CROSS JOIN here
    WHERE pl.is_online AND pl.is_available
      AND pp.status = 'approved'
      AND pp.tier = ${tier}::ride_tier
      AND pl.updated_at > now() - make_interval(secs => ${freshSeconds})
      AND ST_DWithin(pl.location_point, here.g, ${radiusM})
      AND pl.pilot_id <> ALL(${exclude}::uuid[])
      AND (NOT ${womenOnly} OR EXISTS (
        SELECT 1 FROM identity_verifications iv
        WHERE iv.user_id = pl.pilot_id AND iv.verified_female))
      AND (${riderFemale} OR pp.women_passengers_mode = 'off'
        OR (pp.women_passengers_mode = 'night' AND NOT ${night}))
    ORDER BY pl.location_point <-> here.g
    LIMIT ${limit}
  `;
}

/**
 * Pilots who could take this ride next (docs/PRD.md F12): on a trip that
 * ends within `maxRemainingS`, whose drop-off is within `maxDropDistanceM`
 * of the pickup, with "Get requests during trips" on and nothing queued
 * yet. The same tier, freshness and women-only rules as findNearestPilots.
 * Nearest drop-off first.
 */
export async function findChainPilots(params: {
  point: LatLng;
  tier: RideTier;
  maxDropDistanceM: number;
  maxRemainingS: number;
  freshSeconds: number;
  limit: number;
  excludePilotIds: string[];
  womenOnly?: boolean;
  riderVerifiedFemale?: boolean;
  night?: boolean;
}): Promise<Candidate[]> {
  const { point, tier, maxDropDistanceM, maxRemainingS, freshSeconds, limit } = params;
  if (limit <= 0) return [];
  const womenOnly = params.womenOnly ?? false;
  const riderFemale = params.riderVerifiedFemale ?? false;
  const night = params.night ?? false;
  const exclude = params.excludePilotIds.length
    ? params.excludePilotIds
    : ["00000000-0000-0000-0000-000000000000"];
  return db.$queryRaw<Candidate[]>`
    WITH here AS (
      SELECT ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography AS g
    ), trips AS (
      SELECT r.pilot_id,
             ST_Distance(
               ST_SetSRID(ST_MakePoint(r.drop_lng, r.drop_lat), 4326)::geography, here.g
             )::float8 AS drop_distance
      FROM rides r CROSS JOIN here
      WHERE r.status = 'in_progress' AND NOT r.is_queued
        AND r.started_at + make_interval(secs => r.duration_s) <= now() + make_interval(secs => ${maxRemainingS})
    )
    SELECT t.pilot_id AS "pilotId", t.drop_distance AS "distanceM"
    FROM trips t
    JOIN pilot_locations pl ON pl.pilot_id = t.pilot_id
    JOIN pilot_profiles pp ON pp.user_id = t.pilot_id
    WHERE t.drop_distance <= ${maxDropDistanceM}
      AND pl.is_online
      AND pl.updated_at > now() - make_interval(secs => ${freshSeconds})
      AND pp.status = 'approved' AND pp.chain_requests
      AND pp.tier = ${tier}::ride_tier
      AND t.pilot_id <> ALL(${exclude}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM rides q WHERE q.pilot_id = t.pilot_id AND q.is_queued AND q.status = 'accepted')
      AND (NOT ${womenOnly} OR EXISTS (
        SELECT 1 FROM identity_verifications iv
        WHERE iv.user_id = t.pilot_id AND iv.verified_female))
      AND (${riderFemale} OR pp.women_passengers_mode = 'off'
        OR (pp.women_passengers_mode = 'night' AND NOT ${night}))
    ORDER BY t.drop_distance
    LIMIT ${limit}
  `;
}
