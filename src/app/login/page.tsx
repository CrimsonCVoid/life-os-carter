"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "setup-token" | "setup-scan" | "setup-confirm";

type SetupPayload = {
  qrDataUrl: string;
  otpauthUri: string;
  manualKey: string;
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("from") || "/";

  const [mode, setMode] = useState<Mode>("login");
  const [code, setCode] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [setup, setSetup] = useState<SetupPayload | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    codeRef.current?.focus();
  }, [mode]);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/totp/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        attemptsRemaining?: number;
        blockedUntil?: string | null;
      };
      if (!r.ok) {
        setAttemptsRemaining(j.attemptsRemaining ?? null);
        setBlockedUntil(j.blockedUntil ?? null);
        throw new Error(humanError(j.error, j.attemptsRemaining));
      }
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
      setCode("");
    }
  };

  const requestSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/totp/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        qrDataUrl?: string;
        otpauthUri?: string;
        manualKey?: string;
      };
      if (!r.ok || !j.qrDataUrl) throw new Error(humanError(j.error));
      setSetup({
        qrDataUrl: j.qrDataUrl,
        otpauthUri: j.otpauthUri ?? "",
        manualKey: j.manualKey ?? "",
      });
      setMode("setup-scan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/totp/verify-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, setupToken }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        attemptsRemaining?: number;
      };
      if (!r.ok) {
        setAttemptsRemaining(j.attemptsRemaining ?? null);
        throw new Error(humanError(j.error, j.attemptsRemaining));
      }
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
      setCode("");
    }
  };

  return (
    <main style={page}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🌑</span>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Life OS</h1>
        </div>

        {mode === "login" && (
          <>
            <p style={lede}>Welcome back, Carter. Enter the 6-digit code from your authenticator.</p>
            <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
              <CodeInput
                ref={codeRef}
                value={code}
                onChange={setCode}
                onSubmit={handleLogin}
                disabled={busy}
              />
              <button onClick={handleLogin} disabled={busy || code.length !== 6} style={primaryBtn}>
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button
                onClick={() => {
                  setMode("setup-token");
                  setError(null);
                  setAttemptsRemaining(null);
                }}
                style={secondaryBtn}
              >
                First time? Set up authenticator
              </button>
            </div>
          </>
        )}

        {mode === "setup-token" && (
          <>
            <p style={lede}>Enter the setup token to begin.</p>
            <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
              <input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder="PASSKEY_SETUP_TOKEN from env"
                style={input}
                autoComplete="off"
                autoFocus
              />
              <button
                onClick={requestSetup}
                disabled={busy || setupToken.length === 0}
                style={primaryBtn}
              >
                {busy ? "Generating…" : "Continue"}
              </button>
              <button onClick={() => setMode("login")} style={secondaryBtn}>
                Back
              </button>
            </div>
          </>
        )}

        {mode === "setup-scan" && setup && (
          <>
            <p style={lede}>
              Scan this with your authenticator app (Authy, 1Password, Google Authenticator…).
            </p>
            <div style={{ marginTop: 16, display: "grid", gap: 12, placeItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="TOTP QR code"
                style={{ width: 200, height: 200, background: "white", borderRadius: 12, padding: 8 }}
              />
              <details style={{ width: "100%" }}>
                <summary style={{ cursor: "pointer", color: "var(--color-fg-2, #9b9bac)", fontSize: 12 }}>
                  Can't scan? Enter this key manually
                </summary>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--color-bg, #050507)",
                    border: "1px solid var(--color-stroke, #1d1d27)",
                    fontFamily: "ui-monospace, SF Mono, monospace",
                    fontSize: 13,
                    color: "var(--color-fg, #e7e7ee)",
                    wordBreak: "break-all",
                  }}
                >
                  {setup.manualKey}
                </div>
              </details>
              <button onClick={() => setMode("setup-confirm")} style={primaryBtn}>
                I've scanned it
              </button>
            </div>
          </>
        )}

        {mode === "setup-confirm" && (
          <>
            <p style={lede}>Enter the 6-digit code shown in your authenticator to finish setup.</p>
            <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
              <CodeInput
                ref={codeRef}
                value={code}
                onChange={setCode}
                onSubmit={confirmSetup}
                disabled={busy}
              />
              <button
                onClick={confirmSetup}
                disabled={busy || code.length !== 6}
                style={primaryBtn}
              >
                {busy ? "Confirming…" : "Confirm & sign in"}
              </button>
              <button onClick={() => setMode("setup-scan")} style={secondaryBtn}>
                Back to QR code
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={errorBox}>
            {error}
            {attemptsRemaining != null && attemptsRemaining > 0 && (
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Attempts remaining: {attemptsRemaining}
              </div>
            )}
            {blockedUntil && (
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Blocked until {new Date(blockedUntil).toLocaleTimeString()}.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function humanError(code: string | undefined, remaining?: number | null): string {
  switch (code) {
    case "bad-code":
      return remaining != null && remaining > 0
        ? `Wrong code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
        : "Wrong code.";
    case "no-credential":
      return "No authenticator is set up yet. Tap the setup link below.";
    case "not-verified":
      return "Authenticator hasn't been confirmed yet — finish setup first.";
    case "replay":
      return "That code was already used. Wait for a new one and try again.";
    case "too-many-attempts":
      return "Too many attempts. Wait a few minutes.";
    case "ip-blocked":
      return "This IP is temporarily blocked after too many failed attempts.";
    case "unauthorized":
      return "Setup token rejected.";
    default:
      return code || "Something went wrong.";
  }
}

import * as React from "react";

const CodeInput = React.forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
  }
>(({ value, onChange, onSubmit, disabled }, ref) => (
  <input
    ref={ref}
    type="text"
    inputMode="numeric"
    pattern="\d{6}"
    autoComplete="one-time-code"
    maxLength={6}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    onKeyDown={(e) => {
      if (e.key === "Enter" && value.length === 6) onSubmit();
    }}
    placeholder="123 456"
    disabled={disabled}
    style={{
      ...input,
      textAlign: "center",
      letterSpacing: "0.4em",
      fontFamily: "ui-monospace, SF Mono, monospace",
      fontSize: 22,
      padding: "14px 12px",
    }}
  />
));
CodeInput.displayName = "CodeInput";

// Inline styles (kept here so the login page has zero external CSS deps).
const page: React.CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "var(--color-bg, #050507)",
  color: "var(--color-fg, #e7e7ee)",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  padding: 28,
  borderRadius: 20,
  background: "var(--color-elevated, #0e0e14)",
  border: "1px solid var(--color-stroke, #1d1d27)",
};

const lede: React.CSSProperties = {
  color: "var(--color-fg-2, #9b9bac)",
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
};

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

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--color-bg, #050507)",
  border: "1px solid var(--color-stroke, #1d1d27)",
  color: "var(--color-fg, #e7e7ee)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(251, 113, 133, 0.12)",
  border: "1px solid rgba(251, 113, 133, 0.35)",
  color: "#fda4af",
  fontSize: 13,
};
