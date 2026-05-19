"use client";

import useSWR, { mutate } from "swr";

export type IntegrationStatus = {
  provider: string;
  email?: string | null;
  needsReconnect: boolean;
  lastSyncedAt?: string | null;
  expiresAt?: string | null;
  meta?: Record<string, unknown>;
} | null;

const keyFor = (provider: string) => `/api/data/integrations?provider=${provider}`;

export function useIntegration(provider: string) {
  const swr = useSWR<IntegrationStatus>(keyFor(provider));
  return { integration: swr.data ?? null, isLoading: swr.isLoading };
}

export async function disconnectIntegration(provider: string): Promise<void> {
  await fetch(`/api/data/integrations?provider=${provider}`, {
    method: "DELETE",
  });
  await mutate(keyFor(provider));
}
