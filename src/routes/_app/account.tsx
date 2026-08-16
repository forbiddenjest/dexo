import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api/client";
import { useSession, useSignOut } from "@/lib/auth";

export const Route = createFileRoute("/_app/account")({
  head: () => ({
    meta: [
      { title: "Account - Azure" },
      {
        name: "description",
        content: "Review your account details, role and resource totals in Azure.",
      },
      { property: "og:title", content: "Account - Azure" },
      {
        property: "og:description",
        content: "Your profile, role and VPS totals in one place.",
      },
    ],
  }),
  component: AccountPage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function AccountPage() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const { data: vps } = useQuery({ queryKey: ["vps"], queryFn: () => api.listVps() });
  const { data: keys } = useQuery({ queryKey: ["ssh-keys"], queryFn: () => api.listSshKeys() });

  if (!user) return null;

  return (
    <>
      <PageHeader title="Account" description="Your profile and resource totals." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 p-5">
          <div className="mb-1 text-sm font-medium">Profile</div>
          <Separator className="my-2" />
          <Row label="Name" value={user.name} />
          <Row label="Username" value={user.username} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.role} />
          <Row label="User ID" value={user.id} />
        </Card>

        <Card className="gap-0 p-5">
          <div className="mb-1 text-sm font-medium">Resources</div>
          <Separator className="my-2" />
          <Row label="VPS instances" value={String(vps?.length ?? 0)} />
          <Row label="SSH keys" value={String(keys?.length ?? 0)} />
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground">
            Access to your instances is SSH-key only. Keep your private keys off this panel.
          </p>
        </Card>
      </div>

      <Card className="mt-4 gap-3 p-5">
        <div className="text-sm font-medium">Session</div>
        <p className="text-sm text-muted-foreground">
          Signing out ends this browser session immediately.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </>
  );
}
