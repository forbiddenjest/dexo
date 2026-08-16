import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Copy, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { VpsActionButtons, VpsSuspensionButton } from "@/components/vps-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api, ApiError } from "@/lib/api/client";
import { ACTION_LABELS, OS_IMAGES, osLabel, regionLabel, type Vps } from "@/lib/api/types";
import { isAdmin, useSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/vps/$id")({
  head: () => ({
    meta: [
      { title: "VPS details - Azure" },
      {
        name: "description",
        content: "Inspect a VPS instance: status, network details, SSH access and activity.",
      },
      { property: "og:title", content: "VPS details - Azure" },
      {
        property: "og:description",
        content: "Power controls, SSH connection details and activity for one VPS instance.",
      },
    ],
  }),
  component: VpsDetailPage,
});

const PROVISIONING_STAGES = ["Creating VPS", "Configuring network", "Starting VM"];

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ReinstallDialog({ vps }: { vps: Vps }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [osImage, setOsImage] = useState(vps.azureOsImage);
  const [confirmationName, setConfirmationName] = useState("");
  const [sshKeyIds, setSshKeyIds] = useState<string[]>([]);
  const { data: keys } = useQuery({ queryKey: ["ssh-keys"], queryFn: () => api.listSshKeys() });

  const reinstall = useMutation({
    mutationFn: () => api.reinstallVps(vps.id, { osImage, confirmationName, sshKeyIds }),
    onSuccess: () => {
      toast.success("Reinstall queued");
      setOpen(false);
      setConfirmationName("");
      void qc.invalidateQueries();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Reinstall could not be queued."),
  });

  const ready = confirmationName === vps.azureName && sshKeyIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={vps.status === "PROVISIONING"}>
          <RefreshCcw className="size-3.5" />
          Reinstall
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinstall {vps.azureName}</DialogTitle>
          <DialogDescription>
            The operating system and all data on this VPS will be replaced. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>OS image</Label>
            <Select value={osImage} onValueChange={setOsImage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OS_IMAGES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>SSH keys</Label>
            {(keys ?? []).length === 0 && (
              <p className="text-xs text-warning">Add an SSH key before reinstalling.</p>
            )}
            {(keys ?? []).map((key) => (
              <label key={key.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  checked={sshKeyIds.includes(key.id)}
                  onCheckedChange={() =>
                    setSshKeyIds((prev) =>
                      prev.includes(key.id) ? prev.filter((k) => k !== key.id) : [...prev, key.id],
                    )
                  }
                />
                {key.name}
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reinstall-confirm">
              Type <span className="font-mono">{vps.azureName}</span> to confirm
            </Label>
            <Input
              id="reinstall-confirm"
              className="font-mono"
              value={confirmationName}
              onChange={(e) => setConfirmationName(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || reinstall.isPending}
            onClick={() => reinstall.mutate()}
          >
            {reinstall.isPending ? "Queueing…" : "Reinstall VPS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ vps }: { vps: Vps }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");

  const remove = useMutation({
    mutationFn: () => api.deleteVps(vps.id, confirmationName),
    onSuccess: async () => {
      toast.success("Deletion queued");
      setOpen(false);
      await qc.invalidateQueries();
      await navigate({ to: "/vps" });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Deletion could not be queued."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={vps.status === "DELETING"}>
          <Trash2 className="size-3.5" />
          Delete VPS
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {vps.azureName}</DialogTitle>
          <DialogDescription>
            The VM, its disks and network resources are permanently removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm">
            Type <span className="font-mono">{vps.azureName}</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            className="font-mono"
            value={confirmationName}
            onChange={(e) => setConfirmationName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirmationName !== vps.azureName || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "Queueing…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VpsDetailPage() {
  const { id } = Route.useParams();
  const { data: session } = useSession();
  const admin = isAdmin(session);

  const vpsQuery = useQuery({
    queryKey: ["vps", id],
    queryFn: () => api.getVps(id),
    retry: false,
  });

  const status = vpsQuery.data?.status;
  const transitioning = status === "PROVISIONING" || status === "DELETING";

  useQuery({
    queryKey: ["vps-status", id],
    queryFn: async () => {
      const s = await api.getVpsStatus(id);
      if (s.status !== status) await vpsQuery.refetch();
      return s;
    },
    enabled: transitioning,
    refetchInterval: 3500,
  });

  const historyQuery = useQuery({ queryKey: ["history"], queryFn: () => api.history() });

  if (vpsQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (vpsQuery.error || !vpsQuery.data) {
    const message =
      vpsQuery.error instanceof ApiError ? vpsQuery.error.message : "This VPS could not be loaded.";
    return (
      <Card className="items-center gap-3 p-10 text-center">
        <AlertTriangle className="size-6 text-muted-foreground" />
        <div className="text-sm font-medium">{message}</div>
        <Button asChild size="sm" variant="outline">
          <Link to="/vps">Back to VPS list</Link>
        </Button>
      </Card>
    );
  }

  const vps = vpsQuery.data;
  const suspended = vps.suspended === true || vps.status === "SUSPENDED";
  const sshCommand = `ssh ${vps.sshUser}@${vps.publicIp ?? "PUBLIC_IP"}`;
  const activity = (historyQuery.data ?? []).filter((a) => a.vpsId === vps.id).slice(0, 8);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard is unavailable in this browser.");
    }
  };

  return (
    <>
      <Link
        to="/vps"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        VPS
      </Link>

      <PageHeader
        title={vps.azureName}
        description={`${regionLabel(vps.azureRegion)} · ${vps.azureVmSize} · created ${formatDate(vps.createdAt)}`}
        actions={<StatusBadge status={vps.status} />}
      />

      {vps.status === "ERROR" && vps.statusMessage && (
        <Card className="mb-4 gap-2 border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Provisioning error
          </div>
          <p className="text-sm text-destructive/90">{vps.statusMessage}</p>
          <div className="mt-1">
            <ReinstallDialog vps={vps} />
          </div>
        </Card>
      )}

      {suspended && (
        <Card className="mb-4 gap-2 border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" />
            This VPS is suspended
          </div>
          <p className="text-sm text-warning/90">
            {admin
              ? "Power actions are blocked for the owner until you unsuspend this instance."
              : "Power actions are disabled. Contact your administrator to restore access."}
          </p>
        </Card>
      )}

      <Card className="gap-5 p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Public IP" value={vps.publicIp ?? "-"} />
          <Field label="Private IP" value={vps.privateIp ?? "-"} />
          <Field label="OS" value={osLabel(vps.azureOsImage)} mono={false} />
          <Field label="VM size" value={vps.azureVmSize} />
        </div>

        <Separator />

        {transitioning ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-info">
              <Loader2 className="size-4 animate-spin" />
              {vps.status === "DELETING" ? "Deleting VPS…" : "Operation in progress…"}
            </div>
            {vps.status === "PROVISIONING" && (
              <p className="font-mono text-xs text-muted-foreground">
                {PROVISIONING_STAGES.join("  →  ")}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <VpsActionButtons vps={vps} admin={admin} />
            <ReinstallDialog vps={vps} />
          </div>
        )}
      </Card>

      <Card className="mt-4 gap-3 p-5">
        <div className="text-sm font-medium">Connection</div>
        <p className="text-xs text-muted-foreground">
          SSH key access only - password authentication is disabled on this VM.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{sshCommand}</code>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy SSH command"
            onClick={() => void copy(sshCommand)}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      </Card>

      <Card className="mt-4 gap-3 p-5">
        <div className="text-sm font-medium">Activity</div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded actions for this VPS yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{ACTION_LABELS[a.action]}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {admin && (
        <Card className="mt-4 gap-3 border-destructive/30 p-5">
          <div className="text-sm font-medium">Suspension</div>
          <p className="text-sm text-muted-foreground">
            Suspending blocks the owner from starting, stopping, restarting or reinstalling this
            instance.
          </p>
          <div>
            <VpsSuspensionButton vps={vps} />
          </div>
          <Separator />
          <div className="text-sm font-medium text-destructive">Danger zone</div>
          <p className="text-sm text-muted-foreground">
            Deleting this VPS permanently destroys the VM and its disks.
          </p>
          <div>
            <DeleteDialog vps={vps} />
          </div>
        </Card>
      )}
    </>
  );
}
