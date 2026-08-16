import { cn } from "@/lib/utils";
import type { VpsStatus } from "@/lib/api/types";

const STYLES: Record<VpsStatus, string> = {
  RUNNING: "border-success/30 bg-success/10 text-success",
  STOPPED: "border-border bg-muted text-muted-foreground",
  PROVISIONING: "border-info/30 bg-info/10 text-info",
  DELETING: "border-warning/30 bg-warning/10 text-warning",
  SUSPENDED: "border-warning/30 bg-warning/10 text-warning",
  ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};

const PULSING: VpsStatus[] = ["PROVISIONING", "DELETING"];

export function StatusBadge({ status, className }: { status: VpsStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase",
        STYLES[status],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          PULSING.includes(status) && "animate-pulse",
        )}
      />
      {status.toLowerCase()}
    </span>
  );
}
