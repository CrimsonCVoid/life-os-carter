"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

type Mode = "signin" | "setup";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("from") || "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [deviceName, setDeviceName] = useState("");

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const optsRes = await fetch("/api/auth/webauthn/login-options", {
        method: "POST",
      });
      if (!optsRes.ok) throw new Error("Couldn't start sign-in");
      const optionsJSON = await optsRes.json();

      const response = await startAuthentication({ optionsJSON });

      const verifyRes = await fetch("/api/auth/webauthn/login-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!verifyRes.ok) {
        const j = await verifyRes.json().catch(() => ({}));
        throw new Error(j.error || "Sign-in failed");
      }
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup() {
    setBusy(true);
    setError(null);
    try {
      const optsRes = await fetch("/api/auth/webauthn/register-options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken }),
      });
      if (!optsRes.ok) {
        const j = await optsRes.json().catch(() => ({}));
        throw new Error(j.error || "Setup token rejected");
      }
      const optionsJSON = await optsRes.json();

      const response = await startRegistration({ optionsJSON });

      const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response, setupToken, deviceName: deviceName.trim() || null }),
      });
      if (!verifyRes.ok) {
        const j = await verifyRes.json().catch(() => ({}));
        throw new Error(j.error || "Setup failed");
      }
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--color-bg, #050507)",
        color: "var(--color-fg, #e7e7ee)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 28,
          borderRadius: 20,
          background: "var(--color-elevated, #0e0e14)",
          border: "1px solid var(--color-stroke, #1d1d27)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🌑</span>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Life OS</h1>
        </div>
        <p style={{ color: "var(--color-fg-2, #9b9bac)", margin: 0, fontSize: 14 }}>
          {mode === "signin" ? "Welcome back, Carter." : "Set up your first passkey."}
        </p>

        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {mode === "signin" ? (
            <>
              <button
                onClick={handleSignIn}
                disabled={busy}
                style={primaryBtn}
              >
                {busy ? "Authenticating…" : "Sign in with passkey"}
              </button>
              <button
                onClick={() => {
                  setMode("setup");
                  setError(null);
                }}
                style={secondaryBtn}
              >
                First time? Set up a passkey
              </button>
            </>
          ) : (
            <>
              <label style={label}>
                Setup token
                <input
                  type="password"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="From PASSKEY_SETUP_TOKEN env"
                  style={input}
                  autoComplete="off"
                />
              </label>
              <label style={label}>
                Device name <span style={{ opacity: 0.6 }}>(optional)</span>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="MacBook Touch ID"
                  style={input}
                  autoComplete="off"
                />
              </label>
              <button
                onClick={handleSetup}
                disabled={busy || setupToken.length === 0}
                style={primaryBtn}
              >
                {busy ? "Registering…" : "Register passkey"}
              </button>
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                style={secondaryBtn}
              >
                Back to sign in
              </button>
            </>
          )}

          {error && (
            <div
              style={{
                marginTop: 4,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(251, 113, 133, 0.12)",
                border: "1px solid rgba(251, 113, 133, 0.35)",
                color: "#fda4af",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "var(--color-accent, #8b5cf6)",
  color: "white",
  fontWeight: 600,
  fontSize: 15,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "transparent",
  color: "var(--color-fg-2, #9b9bac)",
  fontWeight: 500,
  fontSize: 13,
  border: "1px solid var(--color-stroke, #1d1d27)",
  cursor: "pointer",
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "var(--color-fg-2, #9b9bac)",
};

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--color-bg, #050507)",
  border: "1px solid var(--color-stroke, #1d1d27)",
  color: "var(--color-fg, #e7e7ee)",
  fontSize: 14,
  outline: "none",
};
