import "server-only";

import { Prisma, type SavedPlace } from "@prisma/client";

import { MAX_SAVED_PLACES, type PlaceLabel } from "@/lib/account";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { LatLng } from "@/lib/geo";

/** "14 · Saved places": the rider's own places, nobody else's. */

export type SavedPlaceView = {
  id: string;
  label: PlaceLabel;
  name: string;
  address: string;
  point: LatLng;
};

const view = (p: SavedPlace): SavedPlaceView => ({
  id: p.id,
  label: p.label,
  name: p.name,
  address: p.address,
  point: { lat: p.lat, lng: p.lng },
});

/** Home first, then Work, then the rest in the order they were added. */
export async function listPlaces(userId: string): Promise<SavedPlaceView[]> {
  const rows = await db.savedPlace.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const rank = { home: 0, work: 1, other: 2 };
  return rows.sort((a, b) => rank[a.label] - rank[b.label]).map(view);
}

export type PlaceInput = { label: PlaceLabel; name: string; address: string; point: LatLng };

const duplicate = (label: PlaceLabel) =>
  new AppError(
    "CONFLICT",
    `You already have a ${label === "home" ? "Home" : "Work"} place. Edit that one instead.`,
  );

export async function addPlace(userId: string, input: PlaceInput): Promise<SavedPlaceView> {
  if ((await db.savedPlace.count({ where: { userId } })) >= MAX_SAVED_PLACES) {
    throw new AppError("VALIDATION", `You can save up to ${MAX_SAVED_PLACES} places.`);
  }
  try {
    const row = await db.savedPlace.create({
      data: {
        userId,
        label: input.label,
        name: input.name,
        address: input.address,
        lat: input.point.lat,
        lng: input.point.lng,
      },
    });
    return view(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw duplicate(input.label);
    }
    throw err;
  }
}

export async function updatePlace(userId: string, placeId: string, input: PlaceInput) {
  try {
    const { count } = await db.savedPlace.updateMany({
      where: { id: placeId, userId },
      data: {
        label: input.label,
        name: input.name,
        address: input.address,
        lat: input.point.lat,
        lng: input.point.lng,
      },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "That place doesn't exist.");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw duplicate(input.label);
    }
    throw err;
  }
}

export async function deletePlace(userId: string, placeId: string) {
  const { count } = await db.savedPlace.deleteMany({ where: { id: placeId, userId } });
  if (count === 0) throw new AppError("NOT_FOUND", "That place doesn't exist.");
}

/** Every demo rider starts with Home and Work (docs/PRD.md F1). */
export async function seedDemoPlaces(userId: string): Promise<void> {
  if ((await db.savedPlace.count({ where: { userId } })) > 0) return;
  await db.savedPlace.createMany({
    data: [
      {
        userId,
        label: "home",
        name: "Home",
        address: "27th Main Road, HSR Layout",
        lat: 12.9121,
        lng: 77.6446,
      },
      {
        userId,
        label: "work",
        name: "Work",
        address: "Tech Park, Outer Ring Road",
        lat: 12.926,
        lng: 77.6762,
      },
    ],
    skipDuplicates: true,
  });
}
