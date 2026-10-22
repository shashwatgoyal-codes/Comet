import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { setUpDemo } from "@/lib/services/accounts";
import { addContact, listContacts, removeContact } from "@/lib/services/contacts";
import { addPlace, deletePlace, listPlaces, updatePlace } from "@/lib/services/places";
import { quoteFare } from "@/lib/services/quotes";
import { bookRide } from "@/lib/services/rides";
import { deleteAccount } from "@/lib/services/settings";

/** Saved places, emergency contacts and account deletion against a real database. */

const JAYANAGAR: LatLng = { lat: 12.925, lng: 77.5838 };
const anon = () => ({ id: randomUUID(), email: null, isAnonymous: true });
const rider = async () => (await setUpDemo(anon(), "rider")).id;
const place = (label: "home" | "work" | "other", name = "Mom's place") => ({
  label,
  name,
  address: "4th Cross, Jayanagar 9th Block",
  point: JAYANAGAR,
});

beforeAll(() => {
  process.env.COMET_FAKE_EXTERNALS = "1";
});
afterAll(async () => {
  await db.$disconnect();
});

describe("saved places", () => {
  it("gives a demo rider Home and Work, once", async () => {
    const identity = anon();
    await setUpDemo(identity, "rider");
    await setUpDemo(identity, "rider");
    const places = await listPlaces(identity.id);
    expect(places.map((p) => p.label)).toEqual(["home", "work"]);
  });

  it("adds, edits and deletes places, with one Home at most", async () => {
    const id = await rider();
    const added = await addPlace(id, place("other"));
    expect((await listPlaces(id)).map((p) => p.name)).toContain("Mom's place");
    await expect(addPlace(id, place("home", "Second home"))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await updatePlace(id, added.id, place("other", "Gym"));
    expect((await listPlaces(id)).find((p) => p.id === added.id)?.name).toBe("Gym");
    await deletePlace(id, added.id);
    expect((await listPlaces(id)).find((p) => p.id === added.id)).toBeUndefined();
  });

  it("caps the list at ten", async () => {
    const id = await rider();
    for (let i = 0; i < 8; i++) await addPlace(id, place("other", `Place ${i}`));
    await expect(addPlace(id, place("other"))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps each rider's places to themselves", async () => {
    const owner = await rider();
    const other = await rider();
    const added = await addPlace(owner, place("other"));
    expect((await listPlaces(other)).find((p) => p.id === added.id)).toBeUndefined();
    await expect(deletePlace(other, added.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePlace(other, added.id, place("other", "Mine now"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("emergency contacts", () => {
  it("stores up to three and only ever shows them masked", async () => {
    const id = await rider();
    await addContact(id, "Mom", "+919876543210");
    const list = await listContacts(id);
    expect(list[0]).toMatchObject({ name: "Mom", phone: "+91 98••• ••210" });
    expect(JSON.stringify(list)).not.toContain("9876543210");
    await addContact(id, "Priya", "+919988776655");
    await addContact(id, "Amit", "+919812345678");
    await expect(addContact(id, "Extra", "+919800000000")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("can only be removed by their owner", async () => {
    const owner = await rider();
    await addContact(owner, "Mom", "+919876543210");
    const [contact] = await listContacts(owner);
    await expect(removeContact(await rider(), contact!.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await removeContact(owner, contact!.id);
    expect(await listContacts(owner)).toEqual([]);
  });
});

describe("deleting an account", () => {
  it("anonymises the user and deletes their places and contacts, keeping the Comet ID retired", async () => {
    const id = await rider();
    await addContact(id, "Mom", "+919876543210");
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    await deleteAccount(id);
    const after = await db.user.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({
      displayName: "Deleted user",
      email: null,
      safetyPinHash: null,
      cometId: before.cometId,
    });
    expect(after.deletedAt).not.toBeNull();
    expect(await db.savedPlace.count({ where: { userId: id } })).toBe(0);
    expect(await db.emergencyContact.count({ where: { userId: id } })).toBe(0);
  });

  it("waits until there's no ride in progress", async () => {
    const id = await rider();
    const q = await quoteFare(
      id,
      { address: "Jayanagar", point: JAYANAGAR },
      { address: "MG Road", point: { lat: 12.9756, lng: 77.6066 } },
    );
    await bookRide(id, { quoteId: q.quoteId, tier: "go", paymentMethod: "cash" });
    await expect(deleteAccount(id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
