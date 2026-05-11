"use client";

import * as React from "react";

type OverseerCtx = {
  open: (prefill?: string) => void;
};

const ctx = React.createContext<OverseerCtx | null>(null);

export function OverseerProvider({
  value,
  children,
}: {
  value: OverseerCtx;
  children: React.ReactNode;
}) {
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useOverseer() {
  const v = React.useContext(ctx);
  return v;
}
