import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Play, RotateCw, ShieldCheck, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";
import type { Vps } from "@/lib/api/types";

type Action = "start" | "stop" | "restart";

export function useVpsAction(admin = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vpsId, action }: { vpsId: string; action: Action }) =>
      admin ? api.adminVpsAction(vpsId, action) : api.vpsAction(vpsId, action),
    onSuccess: (_data, vars) => {
      toast.success(`${vars.action[0]!.toUpperCase()}${vars.action.slice(1)} queued`);
      void qc.invalidateQueries();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "The operation could not be queued. Try again.",
      );
    },
  });
}

export function useVpsSuspension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vpsId, suspended }: { vpsId: string; suspended: boolean }) =>
      api.adminSetVpsSuspended(vpsId, suspended),
    onSuccess: (_d, vars) => {
      toast.success(vars.suspended ? "VPS suspended" : "VPS unsuspended");
      void qc.invalidateQueries();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "The suspension could not be updated.",
      );
    },
  });
}

export function VpsSuspensionButton({ vps, size = "sm" }: { vps: Vps; size?: "sm" | "default" }) {
  const suspension = useVpsSuspension();
  const suspended = vps.suspended === true || vps.status === "SUSPENDED";
  const busy = suspension.isPending || vps.status === "PROVISIONING" || vps.status === "DELETING";

  return (
    <Button
      size={size}
      variant={suspended ? "outline" : "outline"}
      disabled={busy}
      className={suspended ? "" : "text-warning hover:text-warning"}
      onClick={() => suspension.mutate({ vpsId: vps.id, suspended: !suspended })}
    >
      {suspended ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}
      {suspended ? "Unsuspend" : "Suspend"}
    </Button>
  );
}

export function VpsActionButtons({
  vps,
  admin = false,
  size = "sm",
}: {
  vps: Vps;
  admin?: boolean;
  size?: "sm" | "default";
}) {
  const action = useVpsAction(admin);
  const suspended = vps.suspended === true || vps.status === "SUSPENDED";
  const busy =
    action.isPending ||
    vps.status === "PROVISIONING" ||
    vps.status === "DELETING" ||
    (suspended && !admin);
  const run = (a: Action) => action.mutate({ vpsId: vps.id, action: a });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant="outline"
        disabled={busy || vps.status === "RUNNING"}
        onClick={() => run("start")}
      >
        <Play className="size-3.5" />
        Start
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={busy || vps.status !== "RUNNING"}
        onClick={() => run("stop")}
      >
        <Square className="size-3.5" />
        Stop
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={busy || vps.status !== "RUNNING"}
        onClick={() => run("restart")}
      >
        <RotateCw className="size-3.5" />
        Restart
      </Button>
    </div>
  );
}
