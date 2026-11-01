"use client";

import { BadgeCheck, Check, Clock, Upload, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { CometLogo } from "@/components/icons/CometMark";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";
import {
  REVIEW_PROMISE_HOURS,
  STEP_IDS,
  STEP_TAGS,
  STEPS,
  VEHICLE_TYPES,
  VEHICLES,
  type StepId,
  type StepState,
} from "@/lib/onboarding";
import { useLive } from "@/lib/realtime/use-live";
import { topics } from "@/lib/realtime/topics";
import type { OnboardingView } from "@/lib/services/onboarding";
import { cn } from "@/lib/utils";

import {
  chooseVehicleAction,
  getOnboardingAction,
  saveLicenceStepAction,
  savePayoutStepAction,
  savePhotosStepAction,
  saveProfileStepAction,
  saveRcStepAction,
  submitApplicationAction,
} from "./actions";

const TAG_STYLES: Record<StepState, string> = {
  todo: "bg-brand-soft text-brand-text",
  added: "bg-muted text-foreground",
  in_review: "bg-warn-soft text-warn",
  verified: "bg-info-soft text-info",
};

const ICON_STYLES: Record<StepState, string> = {
  todo: "bg-muted text-foreground",
  added: "bg-muted text-foreground",
  in_review: "bg-warn-soft text-warn",
  verified: "bg-info-soft text-info",
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "in_review") return <Clock className="size-5" aria-hidden strokeWidth={2.2} />;
  if (state === "todo") return <Upload className="size-5" aria-hidden strokeWidth={2.2} />;
  return <Check className="size-5" aria-hidden strokeWidth={2.4} />;
}

/**
 * "1 · Pilot onboarding": what you'll drive, five steps, then send for
 * review. While it's with ops the page listens for their decision.
 */
export function OnboardingFlow({ pilotId, initial }: { pilotId: string; initial: OnboardingView }) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<StepId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = view.stage === "draft" || view.stage === "rejected";
  const ready = view.progress.next === null;

  useLive(
    view.stage === "in_review" ? topics.pilot(pilotId) : null,
    () => {
      if (view.stage !== "in_review") return;
      getOnboardingAction().then((r) => r.ok && setView(r.data));
    },
    15_000,
  );

  function run(action: () => Promise<ActionResult<OnboardingView>>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setView(result.data);
      after?.();
    });
  }

  const subtitle = {
    draft: `Finish these steps and we'll verify you within ${REVIEW_PROMISE_HOURS} hours.`,
    rejected: "Our team asked for a few changes. Fix them and send your application again.",
    in_review: `Your application is with our team. We'll verify you within ${REVIEW_PROMISE_HOURS} hours.`,
    approved: "You're verified. Go online to start getting ride requests.",
    suspended: "Your Pilot account is paused. Contact Comet Ops to find out why.",
  }[view.stage];

  return (
    <main className="flex min-h-app flex-col md:mx-auto md:w-full md:max-w-[560px] md:py-6">
      <div className="px-5 pt-6 md:px-0">
        <CometLogo suffix="pilot" />
      </div>

      <div className="flex flex-col gap-2 px-5 pt-5 md:px-0">
        <h1 className="font-heading text-[26px] leading-tight font-bold tracking-tight">
          {view.stage === "approved" ? "Welcome aboard" : "Become a Comet Pilot"}
        </h1>
        <p className="leading-normal text-muted-foreground">{subtitle}</p>
      </div>

      {view.stage === "rejected" && view.rejectionReason && (
        <section
          role="alert"
          className="mx-5 mt-4 flex flex-col gap-1 rounded-lg bg-danger-soft p-4 md:mx-0"
        >
          <span className="text-sm font-bold text-danger-text">Changes needed</span>
          <span className="text-sm leading-normal" data-testid="rejection-reason">
            {view.rejectionReason}
          </span>
        </section>
      )}

      {view.stage === "in_review" && (
        <section
          role="status"
          className="mx-5 mt-4 flex items-center gap-3 rounded-lg bg-warn-soft p-4 text-warn md:mx-0"
        >
          <Clock className="size-5 shrink-0" aria-hidden />
          <span className="text-sm font-semibold">
            In review · this page updates by itself when there&apos;s news
          </span>
        </section>
      )}

      {view.stage === "approved" && (
        <section
          role="status"
          className="mx-5 mt-4 flex items-center gap-3 rounded-lg bg-info-soft p-4 text-info md:mx-0"
        >
          <BadgeCheck className="size-5 shrink-0" aria-hidden />
          <span className="text-sm font-semibold">Approved · you can go online now</span>
        </section>
      )}

      <div className="flex flex-col gap-2 px-5 pt-4 md:px-0">
        <div className="flex justify-between text-[13px] font-semibold">
          <span data-testid="onboarding-progress">
            {view.progress.done} of {view.progress.total} done
          </span>
          <span className="text-muted-foreground">{view.progress.percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuenow={view.progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${view.progress.percent}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 px-5 pt-4 md:px-0">
        <span id="vehicle-label" className="text-[13px] font-semibold text-muted-foreground">
          What will you drive?
        </span>
        <div role="radiogroup" aria-labelledby="vehicle-label" className="grid grid-cols-3 gap-2">
          {VEHICLE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={view.vehicleType === type}
              disabled={!editable || pending}
              onClick={() => run(() => chooseVehicleAction({ vehicleType: type }))}
              className={cn(
                "h-12 rounded-md border-2 bg-card text-[15px] font-bold disabled:cursor-default",
                view.vehicleType === type ? "border-primary bg-brand-soft" : "border-border",
              )}
            >
              {VEHICLES[type].label}
            </button>
          ))}
        </div>
      </div>

      <section
        aria-label="Steps"
        className="mt-4 flex flex-1 flex-col rounded-t-[var(--radius-sheet)] bg-card px-5 pt-2 pb-6 md:rounded-3xl"
      >
        <ol className="flex flex-col">
          {STEP_IDS.map((id) => {
            const step = view.steps[id];
            const canOpen = editable && view.vehicleType !== null;
            return (
              <li key={id} className="border-b border-border">
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => setOpen(id)}
                  className="flex w-full items-center gap-3.5 py-3 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-md",
                      ICON_STYLES[step.state],
                    )}
                  >
                    <StepIcon state={step.state} />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{STEPS[id].label}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {step.detail ?? STEPS[id].sub}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
                      TAG_STYLES[step.state],
                    )}
                  >
                    {STEP_TAGS[step.state]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {error && !open && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}

        <div className="mt-auto pt-5">
          {view.stage === "approved" ? (
            <Link
              href="/pilot"
              className="flex h-14 items-center justify-center rounded-lg bg-primary text-[17px] font-bold text-primary-foreground"
            >
              Start driving
            </Link>
          ) : !editable ? null : view.vehicleType === null ? (
            <p className="text-center text-sm text-muted-foreground">
              Choose what you&apos;ll drive to begin.
            </p>
          ) : ready ? (
            <Button
              onClick={() => run(submitApplicationAction)}
              disabled={pending}
              className="h-14 w-full rounded-lg text-[17px] font-bold"
            >
              {pending ? "Sending…" : "Send for review"}
            </Button>
          ) : (
            <Button
              onClick={() => setOpen(view.progress.next)}
              className="h-14 w-full rounded-lg text-[17px] font-bold"
            >
              <Upload className="size-5" aria-hidden strokeWidth={2.2} />
              {STEPS[view.progress.next!].action}
            </Button>
          )}
        </div>
      </section>

      {open && (
        <StepSheet
          step={open}
          view={view}
          pending={pending}
          error={error}
          onClose={() => {
            setOpen(null);
            setError(null);
          }}
          onSave={(action) => run(action, () => setOpen(null))}
        />
      )}
    </main>
  );
}

const FIELD =
  "h-[52px] w-full rounded-md border-2 border-border bg-card px-4 text-base outline-none focus:border-primary";

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </label>
      <input id={id} name={id} className={FIELD} required {...props} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

const SIMULATED_NOTE: Record<StepId, string> = {
  profile: "A real app would take a selfie here. Comet is a demo, so it keeps only your name.",
  licence:
    "A real app would take a photo of your licence. Comet keeps only the last 4 characters and the expiry date.",
  rc: "A real app would take a photo of the RC. Comet keeps only the vehicle details below.",
  photos: "A real app would ask for 3 photos. In this demo nothing is uploaded or stored.",
  payout: "Payouts in Comet are simulated. No money is ever sent to this account.",
};

function StepSheet({
  step,
  view,
  pending,
  error,
  onClose,
  onSave,
}: {
  step: StepId;
  view: OnboardingView;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (action: () => Promise<ActionResult<OnboardingView>>) => void;
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const actions: Record<StepId, () => Promise<ActionResult<OnboardingView>>> = {
      profile: () => saveProfileStepAction({ fullName: form.fullName }),
      licence: () => saveLicenceStepAction({ number: form.number, expiresOn: form.expiresOn }),
      rc: () => saveRcStepAction({ plate: form.plate, model: form.model, colour: form.colour }),
      photos: () => savePhotosStepAction(),
      payout: () => savePayoutStepAction({ upiId: form.upiId }),
    };
    onSave(actions[step]);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/40 md:items-center md:justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-title"
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] bg-background md:max-w-[460px] md:rounded-3xl"
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <h2 id="step-title" className="flex-1 font-heading text-[22px] font-bold tracking-tight">
            {STEPS[step].label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-card"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-5 pb-6">
          <p className="rounded-md bg-info-soft px-3.5 py-2.5 text-[13px] leading-normal text-info">
            {SIMULATED_NOTE[step]}
          </p>
          {step === "profile" && (
            <Field
              id="fullName"
              label="Full name, as on your licence"
              defaultValue={view.fullName}
              autoComplete="name"
              maxLength={60}
            />
          )}
          {step === "licence" && (
            <>
              <Field
                id="number"
                label="Licence number"
                placeholder="KA05 20190012345"
                autoComplete="off"
                maxLength={24}
              />
              <Field id="expiresOn" label="Valid until" type="date" />
            </>
          )}
          {step === "rc" && (
            <>
              <Field
                id="plate"
                label="Number plate"
                placeholder="KA 05 MX 2841"
                defaultValue={view.vehicle?.plate}
                autoComplete="off"
                maxLength={16}
              />
              <Field
                id="model"
                label="Make and model"
                placeholder={view.vehicleType === "bike" ? "Honda Activa" : "Maruti Swift Dzire"}
                defaultValue={view.vehicle?.model}
                maxLength={60}
              />
              <Field
                id="colour"
                label="Colour"
                placeholder="White"
                defaultValue={view.vehicle?.colour}
                maxLength={30}
              />
            </>
          )}
          {step === "payout" && (
            <Field
              id="upiId"
              label="UPI ID"
              placeholder="name@okaxis"
              autoComplete="off"
              maxLength={80}
            />
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger-text">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="h-14 rounded-lg text-[17px] font-bold"
          >
            {pending ? "Saving…" : step === "photos" ? "Add photos (simulated)" : "Save"}
          </Button>
        </form>
      </section>
    </div>
  );
}
