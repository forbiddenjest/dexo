import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, RotateCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up console - Azure" },
      {
        name: "description",
        content:
          "First-run setup: verify the database and Azure connection, then create the administrator account.",
      },
    ],
  }),
  component: SetupPage,
});

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide uppercase " +
        (ok
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive")
      }
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {ok ? okLabel : badLabel}
    </span>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps: { n: 1 | 2; label: string }[] = [
    { n: 1, label: "Check connections" },
    { n: 2, label: "Create administrator" },
  ];
  return (
    <ol className="mb-6 flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.n} className="flex flex-1 items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium " +
                (s.n === step
                  ? "bg-primary text-primary-foreground"
                  : s.n < step
                    ? "bg-success/20 text-success"
                    : "bg-muted text-muted-foreground")
              }
            >
              {s.n < step ? <CheckCircle2 className="size-3.5" /> : s.n}
            </span>
            <span
              className={
                "text-xs font-medium " +
                (s.n === step ? "text-foreground" : "text-muted-foreground")
              }
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
  const usernameValid = username.length >= 3 && USERNAME_PATTERN.test(username.toLowerCase());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 12;
  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === password;
  const step2Valid =
    name.trim().length > 0 &&
    usernameValid &&
    emailValid &&
    passwordValid &&
    confirmPassword.length > 0 &&
    passwordsMatch;

  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api.setupStatus(),
    refetchInterval: (query) => (query.state.data?.needsSetup ? 10_000 : false),
  });

  // Once an administrator already exists on this instance, setup is done —
  // send visitors straight to sign-in instead of letting them retry.
  useEffect(() => {
    if (status.data && !status.data.needsSetup) {
      void navigate({ to: "/" });
    }
  }, [status.data, navigate]);

  const createAdmin = useMutation({
    mutationFn: () => api.setupCreateAdmin({ name, username, email, password }),
    onSuccess: () => {
      toast.success("Administrator account created. Sign in to continue.");
      void navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not complete setup.");
    },
  });

  const dbReady = !!status.data?.database.ok;
  const azureReady = !!status.data?.azure.connected;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="metal-panel metal-sheen w-full max-w-lg rounded-2xl p-7">
        <BrandMark size="lg" subtitle="First-run setup" className="mb-6" />
        <div className="metal-divider mb-6" />
        <StepIndicator step={step} />

        {step === 1 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Check connections</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              These come from the server's environment configuration, not this page — there is
              nothing to type here. Fix anything that isn't ready, then continue.
            </p>

            <Card className="mt-5 gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Database</span>
                {status.isLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <StatusPill ok={dbReady} okLabel="connected" badLabel="unreachable" />
                )}
              </div>
              {status.data?.database.error && (
                <p className="text-xs text-destructive">{status.data.database.error}</p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium">Azure</span>
                {status.isLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <StatusPill ok={azureReady} okLabel="connected" badLabel="not connected" />
                )}
              </div>
              {status.data && !status.data.azure.configured && (
                <p className="text-xs text-muted-foreground">
                  Set <code className="font-mono">AZURE_TENANT_ID</code>,{" "}
                  <code className="font-mono">AZURE_CLIENT_ID</code>,{" "}
                  <code className="font-mono">AZURE_CLIENT_SECRET</code>,{" "}
                  <code className="font-mono">AZURE_SUBSCRIPTION_ID</code>,{" "}
                  <code className="font-mono">AZURE_RESOURCE_GROUP</code> and{" "}
                  <code className="font-mono">AZURE_REGION</code> in the server's{" "}
                  <code className="font-mono">.env</code> file and restart the service.
                </p>
              )}
              {status.data?.azure.configured && status.data.azure.error && (
                <p className="text-xs text-destructive">{status.data.azure.error}</p>
              )}
              {status.data?.azure.connected && (
                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  <div>
                    Subscription:{" "}
                    <span className="font-mono">{status.data.azure.subscriptionId}</span>
                  </div>
                  <div>
                    Resource group:{" "}
                    <span className="font-mono">{status.data.azure.resourceGroup}</span>
                  </div>
                  <div>
                    Region: <span className="font-mono">{status.data.azure.region}</span>
                  </div>
                </div>
              )}
            </Card>

            <div className="mt-5 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => status.refetch()}
                disabled={status.isFetching}
              >
                <RotateCw className={"size-4" + (status.isFetching ? " animate-spin" : "")} />
                Recheck
              </Button>
              <Button onClick={() => setStep(2)} disabled={!dbReady}>
                Continue
              </Button>
            </div>
            {!dbReady && (
              <p className="mt-2 text-xs text-muted-foreground">
                The database must be reachable before an administrator account can be created. Azure
                can be connected later from Configuration once you've signed in.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Create administrator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the first account on this instance and will have full administrator access.
            </p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (password !== confirmPassword) {
                  toast.error("Passwords do not match.");
                  return;
                }
                if (!createAdmin.isPending && step2Valid) createAdmin.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
                {username.length > 0 && !usernameValid && (
                  <p className="text-xs text-destructive">
                    At least 3 characters: lowercase letters, numbers, dots, dashes and underscores
                    only.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
                {email.length > 0 && !emailValid && (
                  <p className="text-xs text-destructive">Enter a valid email address.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                />
                {password.length > 0 && !passwordValid && (
                  <p className="text-xs text-destructive">
                    Password must be at least 12 characters ({password.length}/12).
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" disabled={createAdmin.isPending || !step2Valid}>
                  {createAdmin.isPending ? "Creating…" : "Create account & finish"}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
