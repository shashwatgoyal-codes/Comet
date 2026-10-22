import "server-only";

import { MAX_EMERGENCY_CONTACTS, maskPhone } from "@/lib/account";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Emergency contacts (docs/API.md "Safety"). Stored so the feature is
 * real to set up, but Comet NEVER calls or messages them: SOS contacts no
 * real person or service (docs/PRD.md §7). Only the owner sees them, and
 * only masked; the full number never leaves the server.
 */

export type ContactView = { id: string; name: string; phone: string };

export async function listContacts(userId: string): Promise<ContactView[]> {
  const rows = await db.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, phone: maskPhone(c.phoneE164) }));
}

export async function addContact(userId: string, name: string, phoneE164: string) {
  if ((await db.emergencyContact.count({ where: { userId } })) >= MAX_EMERGENCY_CONTACTS) {
    throw new AppError("VALIDATION", `You can add up to ${MAX_EMERGENCY_CONTACTS} contacts.`);
  }
  await db.emergencyContact.create({ data: { userId, name, phoneE164 } });
}

export async function removeContact(userId: string, contactId: string) {
  const { count } = await db.emergencyContact.deleteMany({ where: { id: contactId, userId } });
  if (count === 0) throw new AppError("NOT_FOUND", "That contact doesn't exist.");
}
