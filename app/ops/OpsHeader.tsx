import { CometLogo } from "@/components/icons/CometMark";

/** The dark bar from "Ops dashboard (web)". */
export function OpsHeader({ initials }: { initials: string }) {
  return (
    <header className="bg-ink text-on-ink">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-4 px-6 py-3.5">
        <CometLogo suffix="ops" />
        <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-info text-sm font-bold text-white dark:text-ink">
          {initials}
        </span>
      </div>
    </header>
  );
}
