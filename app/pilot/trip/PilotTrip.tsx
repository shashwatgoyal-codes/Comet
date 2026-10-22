"use client";

import { Check, Navigation, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";

import { DESKTOP_PANEL, SHEET_HANDLE } from "@/components/layout/panel";
import { ChatButton, ChatPanel, useChat } from "@/components/chat/ChatPanel";
import { LiveMap } from "@/components/map/LiveMap";
import { SosFlow } from "@/components/safety/SosFlow";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatRupees } from "@/lib/money";
import { topics } from "@/lib/realtime/topics";
import { useLive } from "@/lib/realtime/use-live";
import type { RideView } from "@/lib/services/rides";
import type { SosView } from "@/lib/services/sos";
import { FREE_WAIT_S, NO_SHOW_AFTER_S } from "@/lib/trip-fees";
import { useCurrentPosition } from "@/lib/use-current-position";

import {
  endTripAction,
  getPilotRideAction,
  markArrivedAction,
  noShowAction,
  startTripAction,
  updateLocationAction,
} from "../actions";
import { TripSettlement } from "./TripSettlement";

/**
 * The Pilot's trip: "4 · Pickup & OTP", "7 · Waiting & no-show",
 * "5 · On trip", then "5c · Collect cash or UPI" (TripSettlement). Buttons are 56px+ because this
 * is used in a moving car (docs/DESIGN_SYSTEM.md §1).
 */
export function PilotTrip({
  initial,
  initialSos,
  isDemoUser,
}: {
  initial: RideView;
  initialSos: SosView | null;
  isDemoUser: boolean;
}) {
  const router = useRouter();
  const { position } = useCurrentPosition();
  const [ride, setRide] = useState(initial);
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(initialSos !== null);
  const [chatOpen, setChatOpen] = useState(false);
  const { chat, refresh: refreshChat } = useChat(
    ride.id,
    chatOpen,
    ["accepted", "arrived", "in_progress"].includes(ride.status),
  );
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const ended = ["completed", "cancelled", "no_show", "expired"].includes(ride.status);
  const awaitingPayment =
    ride.status === "completed" &&
    (ride.paymentStatus === "pending" || ride.paymentStatus === "failed");
  const finished = ended && !awaitingPayment;

  async function refresh() {
    const result = await getPilotRideAction({ rideId: ride.id });
    if (result.ok) setRide(result.data);
  }
  useLive(finished ? null : topics.ride(ride.id), refresh, 4_000);

  // Keep sharing position so the rider sees the car move.
  const sendLocation = useEffectEvent(() => {
    void updateLocationAction({ point: position, headingDeg: null, speedKmh: null });
  });
  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => sendLocation(), 4_000);
    return () => clearInterval(timer);
  }, [ended]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
      await refresh();
      // After a wrong code, put the cursor straight back for the retry.
      if (!result.ok) requestAnimationFrame(() => codeRef.current?.focus());
    });
  }

  const waitedS = ride.arrivedAt
    ? Math.max(0, (now - new Date(ride.arrivedAt).getTime()) / 1000)
    : 0;
  const freeLeft = Math.max(0, FREE_WAIT_S - waitedS);
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (ride.status === "completed") {
    return <TripSettlement ride={ride} onChange={refresh} onDone={() => router.push("/pilot")} />;
  }

  if (ended) {
    return (
      <main className="flex min-h-app flex-col gap-5 px-5 pt-8 pb-6 md:mx-auto md:max-w-[520px]">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-8" aria-hidden strokeWidth={2.6} />
          </div>
          <h1 className="font-heading text-[26px] font-bold tracking-tight">
            {ride.status === "no_show" ? "Marked as no-show" : "Ride ended"}
          </h1>
        </div>
        {(ride.status === "no_show" || ride.status === "cancelled") && (
          <p className="text-center text-muted-foreground" data-testid="cancel-outcome">
            {ride.status === "cancelled" ? "The rider cancelled. " : ""}
            {ride.cancellationFeePaise === 0
              ? ""
              : ride.paymentStatus === "paid"
                ? `${formatRupees(ride.cancellationFeePaise)} from the rider is in your Pilot wallet.`
                : `The ${formatRupees(ride.cancellationFeePaise)} fee was waived: the rider's wallet couldn't cover it.`}
          </p>
        )}
        <Button
          onClick={() => router.push("/pilot")}
          className="mt-auto h-[60px] rounded-lg text-lg font-bold"
        >
          Back to requests
        </Button>
      </main>
    );
  }

  return (
    <div className="relative h-app overflow-hidden">
      <div className="absolute inset-0">
        <LiveMap
          center={ride.pickup.point}
          pickup={ride.status === "in_progress" ? undefined : ride.pickup.point}
          drop={ride.drop.point}
          car={position}
          route={ride.routeCoordinates}
          bottomInset={0.5}
        />
      </div>

      <div className="absolute inset-x-3 top-4 flex items-center gap-3.5 rounded-xl bg-ink p-4 text-on-ink shadow-float md:inset-x-auto md:top-6 md:right-6 md:w-[440px]">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Navigation className="size-6" aria-hidden strokeWidth={2.4} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-heading text-lg font-bold">
            {ride.status === "in_progress" ? "To drop" : "To pickup"}
          </span>
          <span className="truncate text-sm text-ink-muted">
            {ride.status === "in_progress" ? ride.drop.address : ride.pickup.address}
          </span>
        </span>
        <Button
          variant="destructive"
          onClick={() => setSosOpen(true)}
          className="ml-auto h-12 shrink-0 rounded-full bg-destructive px-4 font-bold text-white"
        >
          <ShieldAlert className="size-[18px]" aria-hidden />
          SOS
        </Button>
      </div>
      {sosOpen && (
        <SosFlow
          rideId={ride.id}
          role="pilot"
          initialAlert={initialSos}
          subject={`Trip with ${ride.rider?.firstName ?? "rider"} · ${ride.rider?.cometId ?? ""}`}
          details={`${ride.rider?.firstName ?? "Rider"} · ${ride.rider?.cometId ?? ""} · ${ride.pickup.address}`}
          isDemo={isDemoUser}
          getPoint={() => position}
          onClose={() => setSosOpen(false)}
        />
      )}

      <section
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-[var(--radius-sheet)] bg-card px-5 pt-3 pb-6 shadow-sheet md:pt-6 ${DESKTOP_PANEL}`}
      >
        <div
          className={`h-[5px] w-10 self-center rounded-full bg-border ${SHEET_HANDLE}`}
          aria-hidden
        />

        {ride.status === "accepted" && (
          <>
            <h1 className="font-heading text-[22px] font-bold tracking-tight">Head to pickup</h1>
            <p className="text-sm text-muted-foreground">{ride.pickup.address}</p>
            <Button
              onClick={() => run(() => markArrivedAction({ rideId: ride.id }))}
              disabled={pending}
              className="h-[60px] rounded-lg text-lg font-bold"
            >
              I&apos;ve arrived
            </Button>
          </>
        )}

        {ride.status === "arrived" && (
          <>
            <div className="flex items-baseline justify-between">
              <h1 className="font-heading text-[22px] font-bold tracking-tight">
                Waiting for rider
              </h1>
              <span className="text-sm font-semibold text-brand-text" aria-live="off">
                {freeLeft > 0
                  ? `Free wait ${clock(freeLeft)}`
                  : `Paid wait +${clock(waitedS - FREE_WAIT_S)}`}
              </span>
            </div>
            <label htmlFor="ride-code" className="text-[15px] font-semibold">
              Ask the rider for their 4-digit code
            </label>
            <InputOTP
              id="ride-code"
              ref={codeRef}
              maxLength={4}
              pattern="^[0-9]*$"
              inputMode="numeric"
              value={code}
              onChange={setCode}
              disabled={pending}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot key={i} index={i} className="size-14 text-2xl" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              onClick={() =>
                run(async () => {
                  const r = await startTripAction({ rideId: ride.id, code });
                  if (!r.ok) setCode("");
                  return r;
                })
              }
              disabled={pending || code.length !== 4}
              className="h-[60px] rounded-lg text-lg font-bold"
            >
              Start trip
            </Button>
            <Button
              variant="outline"
              onClick={() => run(() => noShowAction({ rideId: ride.id }))}
              disabled={pending || waitedS < NO_SHOW_AFTER_S}
              className="h-[52px] rounded-lg font-bold text-danger-text"
            >
              {waitedS < NO_SHOW_AFTER_S
                ? `No-show cancel unlocks in ${clock(NO_SHOW_AFTER_S - waitedS)}`
                : "Rider didn't show · cancel & get ₹40"}
            </Button>
          </>
        )}

        {ride.status === "in_progress" && (
          <>
            <div className="flex items-baseline justify-between">
              <h1 className="font-heading text-[22px] font-bold tracking-tight">On trip</h1>
              <span className="font-heading text-[22px] font-bold">
                {formatRupees(ride.totalPaise)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {ride.paymentMethod === "cash"
                ? "Cash to collect at the drop."
                : ride.paymentMethod === "wallet"
                  ? "Paid from the rider's Comet Wallet when you end the trip."
                  : `The rider pays by ${ride.paymentMethod === "card" ? "card" : "UPI"} at the drop.`}
            </p>
            <Button
              onClick={() => run(() => endTripAction({ rideId: ride.id }))}
              disabled={pending}
              className="h-[60px] rounded-lg bg-ink text-lg font-bold text-on-ink hover:bg-ink/90"
            >
              End trip
            </Button>
          </>
        )}

        <ChatButton unread={chat?.unread ?? 0} onClick={() => setChatOpen(true)} />
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}
      </section>
      {chatOpen && (
        <ChatPanel
          rideId={ride.id}
          chat={chat}
          side="pilot"
          title={`${ride.rider?.firstName ?? "Rider"} · rider`}
          subtitle={
            ride.status === "in_progress" ? ride.drop.address : `Pickup · ${ride.pickup.address}`
          }
          onSent={refreshChat}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
