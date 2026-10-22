/**
 * Realtime channel names and event names (docs/API.md "Realtime events").
 * Browser-safe; shared by the server that sends and the clients that
 * listen. All channels are private: Supabase checks
 * public.realtime_can_listen() before letting anyone subscribe.
 */

export const topics = {
  ride: (rideId: string) => `ride:${rideId}`,
  pilot: (pilotId: string) => `pilot:${pilotId}`,
  rider: (riderId: string) => `rider:${riderId}`,
  /** Ops dashboard alerts. Nobody can listen until the dashboard (phase 10) adds a policy. */
  ops: "ops",
} as const;

export const EVENTS = {
  rideUpdated: "ride.updated",
  pilotLocation: "pilot.location",
  offerCreated: "offer.created",
  offerGone: "offer.gone",
  walletUpdated: "wallet.updated",
  sosRaised: "sos.raised",
  chatMessage: "chat.message",
  sosUpdated: "sos.updated",
} as const;
