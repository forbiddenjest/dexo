import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api/client";
import { isAdmin, useSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in - Azure" },
      {
        name: "description",
        content: "Sign in to manage your Azure VPS instances, SSH keys and activity history.",
      },
      { property: "og:title", content: "Sign in - Azure" },
      {
        property: "og:description",
        content: "Manage Azure VPS instances, SSH keys and activity from one clean dashboard.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { expired?: boolean } =>
    search["expired"] === true || search["expired"] === "true" ? { expired: true } : {},
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const { expired } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // First load of the site: if this instance has no administrator account
  // yet, send visitors to the setup wizard instead of a sign-in form that
  // nobody can use yet.
  const setupStatus = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api.setupStatus(),
    enabled: !session,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (session) {
      void navigate({ to: isAdmin(session) ? "/admin" : "/dashboard" });
      return;
    }
    if (setupStatus.data?.needsSetup) {
      void navigate({ to: "/setup" });
    }
  }, [session, setupStatus.data, navigate]);

  const login = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: async (user) => {
      qc.setQueryData(["session"], user);
      await navigate({ to: isAdmin(user) ? "/admin" : "/dashboard" });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Unable to sign in. Try again.");
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="metal-panel metal-sheen w-full max-w-sm rounded-2xl p-7">
        <BrandMark size="lg" subtitle="Client console" className="mb-6" />
        <div className="metal-divider mb-6" />

        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your account credentials to continue.
        </p>

        {expired && (
          <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Your session ended. Please sign in again.
          </p>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!login.isPending) login.mutate();
          }}
        >
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
      <p className="fixed inset-x-0 bottom-4 text-center text-xs text-muted-foreground">
        All rights reserved - Team PlexScale
      </p>
    </div>
  );
}
