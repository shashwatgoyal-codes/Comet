import "server-only";

import {
  botReply,
  isOpen,
  pilotCanType,
  PILOT_QUICK_REPLIES,
  RIDER_QUICK_REPLIES,
} from "@/lib/chat";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { broadcast } from "@/lib/realtime/broadcast";
import { EVENTS, topics } from "@/lib/realtime/topics";
import { findRideForParticipant } from "@/lib/repositories/rides";

/**
 * Rider–Pilot chat (docs/PRD.md F8, docs/API.md sendMessage). Only the
 * ride's two participants can read or write; messages can be sent while a
 * Pilot is on the way or on the trip, and read afterwards. Phone numbers
 * are never involved.
 */

export type ChatView = {
  messages: { id: string; mine: boolean; body: string; createdAt: string; seen: boolean }[];
  open: boolean;
  canType: boolean;
  quickReplies: readonly string[];
  unread: number;
};

async function participant(userId: string, rideId: string) {
  const ride = await findRideForParticipant(userId, rideId);
  if (!ride) throw new AppError("NOT_FOUND", "That ride doesn't exist.");
  return { ride, role: ride.riderId === userId ? ("rider" as const) : ("pilot" as const) };
}

/**
 * The conversation. With markRead, the other side's messages are marked
 * seen (the chat is on screen); without it, this just counts unread.
 */
export async function getChat(
  userId: string,
  rideId: string,
  markRead: boolean,
): Promise<ChatView> {
  const { ride, role } = await participant(userId, rideId);
  if (markRead) {
    await db.chatMessage.updateMany({
      where: { rideId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
  }
  const rows = await db.chatMessage.findMany({
    where: { rideId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return {
    messages: rows.map((m) => ({
      id: m.id,
      mine: m.senderId === userId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      seen: m.readAt !== null,
    })),
    open: isOpen(ride.status),
    canType: role === "rider" || pilotCanType(ride.status),
    quickReplies: role === "rider" ? RIDER_QUICK_REPLIES : PILOT_QUICK_REPLIES,
    unread: rows.filter((m) => m.senderId !== userId && m.readAt === null).length,
  };
}

export async function sendMessage(
  userId: string,
  rideId: string,
  body: string,
  isQuickReply: boolean,
): Promise<void> {
  const { ride, role } = await participant(userId, rideId);
  if (!isOpen(ride.status)) throw new AppError("CONFLICT", "This chat has closed.");
  const text = body.trim();
  if (!text) throw new AppError("VALIDATION", "Write a message first.");
  // A Pilot who may be driving can only send the fixed quick replies.
  if (role === "pilot" && !pilotCanType(ride.status)) {
    if (!(PILOT_QUICK_REPLIES as readonly string[]).includes(text)) {
      throw new AppError("FORBIDDEN", "You're driving — pick a quick reply.");
    }
  }
  await db.chatMessage.create({
    data: { rideId, senderId: userId, senderRole: role, body: text, isQuickReply },
  });
  await broadcast({
    topic: topics.ride(rideId),
    event: EVENTS.chatMessage,
    payload: { senderRole: role },
  });
}

/**
 * The simulated demo Pilot answers the rider's latest message, once, a
 * couple of seconds after it arrives. Called from the demo tick.
 */
export async function answerAsBot(rideId: string, botId: string, now: Date) {
  const last = await db.chatMessage.findFirst({
    where: { rideId },
    orderBy: { createdAt: "desc" },
  });
  if (!last || last.senderId === botId) return;
  if (now.getTime() - last.createdAt.getTime() < 2_000) return;
  const ride = await db.ride.findUnique({ where: { id: rideId }, select: { status: true } });
  if (!ride || !isOpen(ride.status)) return;
  await db.chatMessage.updateMany({
    where: { rideId, senderId: { not: botId }, readAt: null },
    data: { readAt: now },
  });
  await db.chatMessage.create({
    data: {
      rideId,
      senderId: botId,
      senderRole: "pilot",
      body: botReply(last.body, ride.status),
      isQuickReply: true,
    },
  });
}
