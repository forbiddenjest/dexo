import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { api } from "./api/client";
import type { SessionUser } from "./api/types";

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: ["session"],
    queryFn: () => api.session(),
    staleTime: 30_000,
  });
}

export function useRequireSession(options?: { adminOnly?: boolean }) {
  const navigate = useNavigate();
  const query = useSession();
  const user = query.data ?? null;

  useEffect(() => {
    if (query.isLoading) return;
    if (!user) {
      void navigate({ to: "/", search: { expired: true } });
      return;
    }
    if (options?.adminOnly && user.role === "CUSTOMER") {
      void navigate({ to: "/dashboard" });
    }
  }, [query.isLoading, user, options?.adminOnly, navigate]);

  return { user, isLoading: query.isLoading };
}

export function useSignOut() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    await api.logout();
    qc.clear();
    void navigate({ to: "/" });
  };
}

export function isAdmin(user: SessionUser | null | undefined) {
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}
