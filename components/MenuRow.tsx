import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

/** One row of an account menu ("9 · Account & Comet ID"). */
export function MenuRow({
  href,
  label,
  hint,
  Icon,
}: {
  href: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 border-b border-border py-3.5 last:border-b-0"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="flex-1 text-base font-semibold">{label}</span>
      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
