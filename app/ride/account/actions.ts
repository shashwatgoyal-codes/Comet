"use server";

import { redirect } from "next/navigation";

import { runAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { addContact, removeContact } from "@/lib/services/contacts";
import { addPlace, deletePlace, updatePlace } from "@/lib/services/places";
import { deleteAccount, setHideLastName } from "@/lib/services/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  contactIdSchema,
  contactSchema,
  deleteAccountSchema,
  hideLastNameSchema,
  placeIdSchema,
  placeSchema,
  updatePlaceSchema,
} from "@/lib/validation/account";

/** Account actions (docs/API.md "Account", "Safety"). */

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return user.id;
}

export async function addPlaceAction(input: unknown) {
  return runAction("place.add", async () => {
    const userId = await requireUserId();
    const parsed = placeSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Give the place a name and an address.");
    return addPlace(userId, parsed.data);
  });
}

export async function updatePlaceAction(input: unknown) {
  return runAction("place.update", async () => {
    const userId = await requireUserId();
    const parsed = updatePlaceSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Give the place a name and an address.");
    const { placeId, ...place } = parsed.data;
    await updatePlace(userId, placeId, place);
    return { saved: true };
  });
}

export async function deletePlaceAction(input: unknown) {
  return runAction("place.delete", async () => {
    const userId = await requireUserId();
    const parsed = placeIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That place doesn't exist.");
    await deletePlace(userId, parsed.data.placeId);
    return { deleted: true };
  });
}

export async function addContactAction(input: unknown) {
  return runAction("contact.add", async () => {
    const userId = await requireUserId();
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Check the name and number.",
      );
    }
    await addContact(userId, parsed.data.name, parsed.data.phone);
    return { added: true };
  });
}

export async function removeContactAction(input: unknown) {
  return runAction("contact.remove", async () => {
    const userId = await requireUserId();
    const parsed = contactIdSchema.safeParse(input);
    if (!parsed.success) throw new AppError("NOT_FOUND", "That contact doesn't exist.");
    await removeContact(userId, parsed.data.contactId);
    return { removed: true };
  });
}

export async function setHideLastNameAction(input: unknown) {
  return runAction("settings.hide_last_name", async () => {
    const userId = await requireUserId();
    const parsed = hideLastNameSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "That setting isn't valid.");
    await setHideLastName(userId, parsed.data.hide);
    return { saved: true };
  });
}

/** "Delete my account": confirmed by typing DELETE, then signed out. */
export async function deleteAccountAction(input: unknown) {
  const result = await runAction("account.delete", async () => {
    const userId = await requireUserId();
    const parsed = deleteAccountSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", 'Type "DELETE" to confirm.');
    await deleteAccount(userId);
    return { deleted: true };
  });
  if (!result.ok) return result;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
