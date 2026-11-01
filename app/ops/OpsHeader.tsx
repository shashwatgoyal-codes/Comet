import { CometLogo } from "@/components/icons/CometMark";

/** The dark bar from "Ops dashboard (web)". */
export function OpsHeader({ initials }: { initials: string }) {
  return (
    <header className="bg-ink text-on-ink">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-4 px-6 py-3.5">
        <CometLogo suffix="ops" />
        <nav aria-label="Ops sections" className="flex flex-wrap gap-1 text-sm font-semibold">
          {[
            ["Overview", "#top"],
            ["Pilots", "#pilots"],
            ["Trips", "#trips"],
            ["Promos", "#promos"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="flex h-9 items-center rounded-[10px] px-3.5 text-ink-muted hover:bg-white/10 hover:text-on-ink"
            >
              {label}
            </a>
          ))}
        </nav>
        <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-info text-sm font-bold text-white dark:text-ink">
          {initials}
        </span>
      </div>
    </header>
  );
}
