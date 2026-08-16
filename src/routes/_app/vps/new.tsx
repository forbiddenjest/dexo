import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api/client";
import { OS_IMAGES, REGIONS, VM_SIZES, VM_SIZE_GROUPS } from "@/lib/api/types";
import { useRequireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/vps/new")({
  head: () => ({
    meta: [
      { title: "Create VPS (Admin) - Azure" },
      {
        name: "description",
        content:
          "Admins provision a new Azure VPS for a registered user: region, VM size, OS image and SSH keys.",
      },
      { property: "og:title", content: "Create VPS (Admin) - Azure" },
      {
        property: "og:description",
        content: "Provision a Linux VPS on Azure on behalf of a registered user.",
      },
    ],
  }),
  component: CreateVpsPage,
});

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

function CreateVpsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useRequireSession({ adminOnly: true });
  const isAdminUser = !!user && user.role !== "CUSTOMER";

  const [ownerId, setOwnerId] = useState("");

  const { data: customers } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => api.adminCustomers(),
    enabled: isAdminUser,
  });

  const { data: keys, isLoading: keysLoading } = useQuery({
    queryKey: ["admin-ssh-keys", ownerId],
    queryFn: () => api.adminSshKeys(ownerId),
    enabled: isAdminUser && !!ownerId,
  });

  const { data: azureStatus } = useQuery({
    queryKey: ["admin-azure-status"],
    queryFn: () => api.azureStatus(),
    enabled: isAdminUser,
  });

  const [name, setName] = useState("");
  const [vmSize, setVmSize] = useState(VM_SIZES[1]!.value);
  const [osImage, setOsImage] = useState(OS_IMAGES[0]!.value);
  const [sshKeyIds, setSshKeyIds] = useState<string[]>([]);

  const nameValid = NAME_PATTERN.test(name);
  const canSubmit = nameValid && sshKeyIds.length > 0 && !!ownerId;

  const create = useMutation({
    mutationFn: () => api.createVps({ name, vmSize, osImage, sshKeyIds, ownerId }),
    onSuccess: async (vps) => {
      await qc.invalidateQueries({ queryKey: ["vps"] });
      toast.success("Provisioning started");
      await navigate({ to: "/vps/$id", params: { id: vps.id } });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "The VPS could not be created. Try again.",
      );
    },
  });

  const toggleKey = (id: string) =>
    setSshKeyIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));

  if (!isAdminUser) return null;

  return (
    <>
      <PageHeader
        title="Create VPS"
        description="Admins only. Provision an instance on behalf of a registered user."
      />

      <form
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !create.isPending) create.mutate();
        }}
      >
        <div className="space-y-4">
          <Card className="gap-4 p-5">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select
                value={ownerId}
                onValueChange={(v) => {
                  setOwnerId(v);
                  setSshKeyIds([]);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a registered user" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} - {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The instance is assigned to this account; they can manage it but not delete it.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">VPS name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="web-edge-01"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens. 3–32 characters.
              </p>
              {name.length > 0 && !nameValid && (
                <p className="text-xs text-destructive">That name is not a valid Azure VM name.</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Region</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                  {azureStatus?.region
                    ? (REGIONS.find((r) => r.value === azureStatus.region)?.label ??
                      azureStatus.region)
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fixed by this deployment's server configuration — not selectable per VPS.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>VM size</Label>
                <Select value={vmSize} onValueChange={setVmSize}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VM_SIZE_GROUPS.map((group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {VM_SIZES.filter((s) => s.group === group).map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
          </Card>

          <Card className="gap-3 p-5">
            <div>
              <Label>SSH keys</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Keys belong to the selected owner. Password login is disabled; at least one key is
                required.
              </p>
            </div>

            {!ownerId && <p className="text-sm text-muted-foreground">Select an owner first.</p>}

            {ownerId && keysLoading && (
              <p className="text-sm text-muted-foreground">Loading keys…</p>
            )}

            {ownerId && !keysLoading && (keys ?? []).length === 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <KeyRound className="size-4" />
                  This user has no SSH keys yet.
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(keys ?? []).map((key) => (
                <label
                  key={key.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={sshKeyIds.includes(key.id)}
                    onCheckedChange={() => toggleKey(key.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{key.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {key.fingerprint}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Added {formatDate(key.createdAt)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Card>
        </div>

        <Card className="h-fit gap-4 p-5">
          <div className="text-sm font-medium">Summary</div>
          <dl className="space-y-2 text-sm">
            {[
              ["Owner", (customers ?? []).find((c) => c.id === ownerId)?.email ?? "-"],
              ["Name", name || "-"],
              [
                "Region",
                azureStatus?.region
                  ? (REGIONS.find((r) => r.value === azureStatus.region)?.label ??
                    azureStatus.region)
                  : "-",
              ],
              ["Size", vmSize],
              ["OS", OS_IMAGES.find((o) => o.value === osImage)?.label ?? osImage],
              ["SSH keys", String(sshKeyIds.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-xs">{value}</dd>
              </div>
            ))}
          </dl>
          <Button type="submit" disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Creating…" : "Create VPS"}
          </Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link to="/vps">Cancel</Link>
          </Button>
        </Card>
      </form>
    </>
  );
}
