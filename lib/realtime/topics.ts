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
  /**
   * Ops alerts. Nobody can listen: the ops role is an env allowlist the
   * database can't check, so the dashboard polls instead (docs/PRD.md F10).
   */
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
  /** On pilot:{id} when ops approve or reject the application. */
  pilotStatus: "pilot.status",
} as const;
