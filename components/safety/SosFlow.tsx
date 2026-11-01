"use client";

import { Check, Phone, ShieldAlert, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { LatLng } from "@/lib/geo";
import {
  DEMO_SAFETY_PIN,
  PILOT_SOS_REASONS,
  SOS_COUNTDOWN_S,
  type SosReasonId,
} from "@/lib/safety";
import { topics } from "@/lib/realtime/topics";
import { useLive } from "@/lib/realtime/use-live";
import type { SosView } from "@/lib/services/sos";
import { cn } from "@/lib/utils";

import { endSosAction, getSosAction, raiseSosAction } from "@/app/safety/actions";

/**
 * "6d · SOS emergency" (rider) and "5d · Pilot SOS" on the canvas.
 *
 * A 3-second countdown that can be cancelled, then the alert — retried
 * every few seconds until the server has it, because raising an SOS must
 * never fail quietly (docs/SECURITY.md §9). Ending it needs the safety
 * PIN. Comet never calls or messages anyone: the "Call 112" buttons
 * explain how to call from the phone instead of dialling.
 */
export function SosFlow({
  rideId,
  role,
  initialAlert,
  subject,
  details,
  isDemo,
  getPoint,
  onShare,
  onClose,
}: {
  rideId: string;
  role: "rider" | "pilot";
  /** An SOS already open on this ride (after a reload): skip the countdown. */
  initialAlert: SosView | null;
  /** "Trip with Rohan · KA 05 MX 2841" */
  subject: string;
  /** What Comet has on file about the other person. */
  details: string;
  isDemo: boolean;
  getPoint?: () => LatLng | null;
  onShare?: () => void;
  onClose: () => void;
}) {
  const [alert, setAlert] = useState<SosView | null>(initialAlert);
  const [left, setLeft] = useState(SOS_COUNTDOWN_S);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [reason, setReason] = useState<SosReasonId | null>(null);
  const [calling, setCalling] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  const sendingRef = useRef(false);

  async function send() {
    if (sendingRef.current || alert) return;
    sendingRef.current = true;
    setSending(true);
    // Keep trying until the server has it. Nothing here gives up.
    while (!stopped.current) {
      const result = await raiseSosAction({ rideId, reason, point: getPoint?.() ?? null });
      if (result.ok) {
        setAlert(result.data);
        setRetrying(false);
        return;
      }
      setRetrying(true);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  // The countdown's timer always calls the latest send (with the latest reason).
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    if (initialAlert) return;
    // Reset after React's development double-mount, which runs the cleanup once.
    stopped.current = false;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setLeft(Math.max(0, SOS_COUNTDOWN_S - elapsed));
      if (elapsed >= SOS_COUNTDOWN_S) {
        clearInterval(timer);
        void sendRef.current();
      }
    }, 250);
    return () => {
      clearInterval(timer);
      stopped.current = true;
    };
  }, [initialAlert]);

  // Follow the alert while it's open: ops assigning or closing it.
  useLive(
    alert && alert.status !== "resolved" ? topics.ride(rideId) : null,
    () => {
      if (!alert) return;
      getSosAction({ alertId: alert.id }).then((r) => r.ok && setAlert(r.data));
    },
    5_000,
  );

  async function end() {
    if (!alert) return;
    setBusy(true);
    setPinError(null);
    const result = await endSosAction({ alertId: alert.id, pin });
    setBusy(false);
    if (result.ok) {
      onClose();
      return;
    }
    setPin("");
    setPinError(result.message);
  }

  const callDialog = calling && (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-title"
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-t-[var(--radius-sheet)] bg-card p-6 sm:rounded-xl"
      >
        <h2 id="call-title" className="font-heading text-xl font-bold">
          Call from your phone
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Comet can&apos;t place calls. Open your phone&apos;s dialer and call{" "}
          <b className="text-foreground">112</b> for police
          {role === "pilot" ? (
            <>
              , or <b className="text-foreground">108</b> for an ambulance
            </>
          ) : null}
          . Your SOS stays active while you call.
        </p>
        <Button onClick={() => setCalling(false)} className="h-12 rounded-lg font-bold">
          OK
        </Button>
      </div>
    </div>
  );

  // ------------------------------------------------------------ countdown
  if (!alert) {
    const fraction = sending ? 1 : (SOS_COUNTDOWN_S - left) / SOS_COUNTDOWN_S;
    const ring = role === "pilot" ? 60 : 100;
    const size = role === "pilot" ? 132 : 220;
    const circumference = 2 * Math.PI * ring;
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sos-title"
        className="fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto bg-[#FBF3F2] px-5 py-6 md:px-[max(1.25rem,calc(50%-16rem))] text-[#0E1220] dark:bg-[#140B0E] dark:text-[#F2F4FA]"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px] font-bold text-danger-text">
            <ShieldAlert className="size-5" aria-hidden />
            {role === "pilot" ? "Pilot SOS" : "Emergency SOS"}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">{subject}</span>
        </div>

        <div
          className={cn("flex items-center gap-4", role === "rider" && "flex-col py-3 text-center")}
        >
          <button
            type="button"
            onClick={() => void send()}
            aria-label="Send SOS alert now"
            style={{ width: size, height: size }}
            className="relative flex shrink-0 items-center justify-center rounded-full bg-danger-soft"
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="absolute inset-0"
              aria-hidden
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={ring}
                fill="none"
                strokeWidth={role === "pilot" ? 8 : 10}
                className="stroke-danger-soft"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={ring}
                fill="none"
                strokeWidth={role === "pilot" ? 8 : 10}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - fraction)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="stroke-destructive transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span
              className="relative flex flex-col items-center justify-center rounded-full bg-destructive text-white"
              style={{ width: size * 0.74, height: size * 0.74 }}
            >
              <span
                className={cn(
                  "font-heading leading-none font-bold",
                  role === "pilot" ? "text-4xl" : "text-[56px]",
                )}
                aria-live="assertive"
              >
                {sending ? "…" : left}
              </span>
              <span className="text-[11px] font-bold tracking-wide">
                {sending ? "SENDING" : "TAP TO SEND NOW"}
              </span>
            </span>
          </button>
          <div className="flex flex-col gap-1.5">
            <h1
              id="sos-title"
              className="font-heading text-[22px] leading-tight font-bold tracking-tight"
            >
              {sending
                ? retrying
                  ? "Still sending — retrying…"
                  : "Sending your alert…"
                : role === "pilot"
                  ? `Alerting Comet safety in ${left} s`
                  : `Sending an alert in ${left} seconds`}
            </h1>
            <p className="text-[15px] leading-normal text-muted-foreground">
              {role === "pilot"
                ? "Pull over when it's safe. You don't need to explain anything."
                : "We'll alert Comet's safety team and log your trip and live location."}
            </p>
          </div>
        </div>

        {role === "pilot" && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">
              What&apos;s happening? (optional — helps us send the right help)
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PILOT_SOS_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={reason === r.id}
                  onClick={() => setReason(reason === r.id ? null : r.id)}
                  className={cn(
                    "min-h-[60px] rounded-lg border-2 px-3 py-2 text-left text-[15px] font-bold",
                    reason === r.id
                      ? "border-destructive bg-danger-soft"
                      : "border-transparent bg-card",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2.5">
          <Button
            onClick={() => setCalling(true)}
            className="h-[60px] rounded-lg bg-ink text-[17px] font-bold text-on-ink hover:bg-ink/90"
          >
            <Phone className="size-5" aria-hidden />
            Call 112 instead
          </Button>
          {!sending && (
            <Button
              variant="outline"
              onClick={() => {
                stopped.current = true;
                onClose();
              }}
              className="h-[52px] rounded-lg text-base font-bold"
            >
              {role === "pilot" ? "Cancel — back to navigation" : "Cancel — I tapped by mistake"}
            </Button>
          )}
        </div>
        {callDialog}
      </div>
    );
  }

  // --------------------------------------------------------------- active
  const steps = [
    alert.status === "resolved"
      ? { title: "Closed by Comet's safety team", sub: "You can end SOS with your PIN" }
      : alert.status === "acknowledged"
        ? { title: "A safety agent has your alert", sub: "They're following your trip now" }
        : { title: "Comet safety team alerted", sub: "Your alert is on the safety dashboard" },
    { title: "Trip details logged", sub: details },
    {
      title: "Live location shared with Comet",
      sub:
        role === "pilot"
          ? "From your phone, until you end SOS"
          : "From your Pilot's car, until you end SOS",
    },
  ];
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sos-active-title"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#FBF3F2] md:[&>*]:px-[max(1.25rem,calc(50%-16rem))] text-[#0E1220] dark:bg-[#140B0E] dark:text-[#F2F4FA]"
    >
      <div className="flex flex-col gap-1.5 bg-destructive px-5 pt-6 pb-5 text-white">
        <span className="flex items-center gap-2 text-[13px] font-bold tracking-wider">
          <span className="size-2.5 animate-pulse rounded-full bg-white" aria-hidden />
          SOS ACTIVE ·{" "}
          {alert.reason
            ? PILOT_SOS_REASONS.find((r) => r.id === alert.reason)?.tag
            : new Date(alert.createdAt).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
              })}
        </span>
        <h1 id="sos-active-title" className="font-heading text-[26px] font-bold tracking-tight">
          Help is on the way
        </h1>
        <span className="text-[15px] opacity-90">
          {role === "pilot"
            ? "Stay calm. Stop somewhere safe and well lit if you can."
            : "Stay on this screen. Keep your phone with you."}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 py-4">
        {steps.map((s) => (
          <div key={s.title} className="flex items-center gap-3 rounded-lg bg-card px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
              <Check className="size-4" strokeWidth={2.8} aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">{s.title}</span>
              <span className="text-[13px] text-muted-foreground">{s.sub}</span>
            </span>
          </div>
        ))}
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card px-3.5 py-3 text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
              <Share2 className="size-4" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">Share your trip with someone you trust</span>
              <span className="text-[13px] text-muted-foreground">
                They&apos;ll see the car live
              </span>
            </span>
          </button>
        )}
        <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-[13px] leading-normal text-muted-foreground">
          Comet is a portfolio project: no real person or emergency service is contacted. In a real
          emergency, call 112 from your phone.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-6">
        {ending ? (
          <section
            className="flex flex-col gap-3 rounded-xl bg-card p-4"
            aria-label="End SOS with your PIN"
          >
            <label id="pin-label" htmlFor="sos-pin" className="font-bold">
              Enter your 4-digit safety PIN
            </label>
            {isDemo && (
              <span className="text-[13px] text-muted-foreground">
                Demo accounts use PIN <b className="text-foreground">{DEMO_SAFETY_PIN}</b>.
              </span>
            )}
            <InputOTP
              id="sos-pin"
              maxLength={4}
              pattern="^[0-9]*$"
              inputMode="numeric"
              value={pin}
              onChange={setPin}
              disabled={busy}
              autoFocus
            >
              <InputOTPGroup>
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot key={i} index={i} className="size-14 text-2xl" mask />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {pinError && (
              <p role="alert" className="text-sm font-semibold text-danger-text">
                {pinError}
              </p>
            )}
            <Button
              onClick={end}
              disabled={busy || pin.length !== 4}
              className="h-12 rounded-lg font-bold"
            >
              {busy ? "Checking…" : "End SOS"}
            </Button>
          </section>
        ) : (
          <>
            <div className={cn("grid gap-2", role === "pilot" ? "grid-cols-2" : "grid-cols-1")}>
              <Button
                onClick={() => setCalling(true)}
                className="h-[60px] rounded-lg bg-destructive text-base font-bold text-white hover:bg-destructive/90"
              >
                <Phone className="size-5" aria-hidden />
                Call 112 · Police
              </Button>
              {role === "pilot" && (
                <Button
                  onClick={() => setCalling(true)}
                  className="h-[60px] rounded-lg bg-ink text-base font-bold text-on-ink hover:bg-ink/90"
                >
                  Call 108 · Ambulance
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setEnding(true)}
              className="h-[52px] rounded-lg text-base font-bold"
            >
              I&apos;m safe now · enter PIN to end
            </Button>
          </>
        )}
      </div>
      {callDialog}
    </div>
  );
}
