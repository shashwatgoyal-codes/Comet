/**
 * Chat rules (docs/PRD.md F8, "6b · Chat with Pilot" and "4b · Chat with
 * rider"). Pure and browser-safe.
 */

export const MAX_MESSAGE_LENGTH = 500;

/** Chat is open while a Pilot is on the way or on the trip. */
export const CHAT_OPEN_STATUSES = ["accepted", "arrived", "in_progress"] as const;

export const RIDER_QUICK_REPLIES = [
  "I'm coming",
  "Where are you?",
  "Please wait 2 min",
  "I see you",
] as const;

export const PILOT_QUICK_REPLIES = [
  "On my way",
  "Reached pickup",
  "Stuck in traffic · 5 min",
  "Can't find you — where are you?",
  "Please come to the main road",
  "Okay, thanks",
] as const;

/**
 * Pilots may type only while parked at the pickup. Any other time they
 * may be driving, so it's quick replies only — enforced on the server.
 */
export function pilotCanType(status: string): boolean {
  return status === "arrived";
}

export function isOpen(status: string): boolean {
  return (CHAT_OPEN_STATUSES as readonly string[]).includes(status);
}

/** The simulated demo Pilot's answer to a rider's message. */
export function botReply(riderMessage: string, status: string): string {
  const m = riderMessage.toLowerCase();
  if (/where|find|location/.test(m)) {
    return status === "arrived" ? "I'm at the pickup point, in a white car." : "On my way";
  }
  if (/wait|late|minute|min\b/.test(m)) return "No problem, I'll wait.";
  if (/see you|coming|on my way|here/.test(m)) return "Okay, thanks";
  return status === "arrived" ? "Okay, I'm at the pickup." : "Okay, thanks";
}
