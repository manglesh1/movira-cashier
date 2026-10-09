// ClockIn — tile-grid + PIN pad for cashier sign-in.
// Replaces email/password as the primary login flow on a paired tablet.
//
// Flow:
//   1. Loads staff for the paired terminal's location
//   2. Cashier taps their photo/initials tile → PIN pad slides in
//   3. PIN entered → clockIn mutation → token in Redux → CashierApp loads
//
// "Use email instead" link at the bottom routes to the legacy form for
// managers / one-off admin sign-ins.

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGetClockInOptionsQuery, useClockInMutation } from "../features/auth/authApi";
import { getTerminal, clearTerminal } from "../lib/terminal";
import { appConfirm } from "../services/appDialog";

const PIN_LENGTH = 4;

const initialsOf = (u) =>
  `${(u.firstName || "")[0] || ""}${(u.lastName || "")[0] || ""}`.toUpperCase();

const PALETTE = ["#7220E6", "#7220E6", "#18B8C9", "#1F9D55", "#D6361A", "#E9A100", "#480D9A", "#480D9A"];
const colorFor = (u) => PALETTE[(((u.firstName || "?").charCodeAt(0) || 0) + (u.userId || 0)) % PALETTE.length];

export default function ClockIn({ onUseEmailLogin }) {
  const terminal = getTerminal();
  const { data, isLoading, error, refetch } = useGetClockInOptionsQuery(terminal?.deviceId, {
    skip: !terminal?.deviceId,
  });
  const [clockIn, { isLoading: isSubmitting }] = useClockInMutation();
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState("");

  const users = data?.data?.users || [];

  useEffect(() => {
    if (!picked) setPin("");
  }, [picked]);

  const submit = async () => {
    if (!picked || pin.length !== PIN_LENGTH) return;
    try {
      await clockIn({
        deviceId: terminal.deviceId,
        userId: picked.userId,
        pin,
      }).unwrap();
      toast.success(`Clocked in · ${picked.firstName}`);
    } catch (err) {
      console.error("Clock-in error:", err);
      const msg =
        err?.data?.error ||
        (err?.status === 401 && "Incorrect PIN") ||
        (err?.status === 403 && err?.data?.error) ||
        "Clock-in failed";
      toast.error(String(msg), { duration: 4000 });
      setPin("");
    }
  };

  const tap = (digit) => setPin((p) => (p.length < PIN_LENGTH ? p + digit : p));
  const back = () => setPin((p) => p.slice(0, -1));
  const pairingRejected =
    error?.status === 401 &&
    String(error?.data?.error || "").toLowerCase().includes("pairing");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ink-25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "white",
          border: "2px solid var(--ink-800)",
          borderRadius: 22,
          boxShadow: "0 6px 0 var(--ink-800)",
          padding: 28,
          width: "min(720px, 100%)",
          maxHeight: "94vh",
          overflow: "auto",
        }}
      >
        {/* Header — terminal + location */}
        <TerminalBar terminal={terminal} onSwitch={async () => {
          if (await appConfirm({ title: "Unpair this terminal?", message: "This device will need a new pairing code before it can be used again.", confirmLabel: "Unpair" })) {
            clearTerminal();
            window.location.reload();
          }
        }} />

        {!picked ? (
          <>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 800,
                color: "var(--ink-900)",
                marginTop: 18,
                marginBottom: 4,
              }}
            >
              Tap your tile to clock in
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 18 }}>
              {users.length > 0
                ? `${users.length} staff`
                : isLoading
                  ? "Loading staff…"
                  : error
                    ? "Staff list unavailable"
                    : "No eligible staff"}
            </div>

            {isLoading && <div style={{ padding: 32, textAlign: "center", color: "var(--ink-500)" }}>Loading…</div>}

            {error && (
              <StaffLoadError
                error={error}
                pairingRejected={pairingRejected}
                onRetry={refetch}
                onPairAgain={() => {
                  clearTerminal();
                  window.location.reload();
                }}
              />
            )}

            {!isLoading && !error && users.length === 0 && (
              <EmptyState />
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              {users.map((u) => (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => setPicked(u)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    background: "white",
                    border: "2px solid var(--ink-800)",
                    borderRadius: 16,
                    boxShadow: "0 4px 0 var(--ink-800)",
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    transition: "transform 100ms ease",
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(4px)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
                >
                  {u.photoUrl ? (
                    <img
                      src={u.photoUrl}
                      alt=""
                      style={{
                        width: 72, height: 72, borderRadius: 16,
                        objectFit: "cover",
                        border: "1.5px solid var(--ink-800)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72, height: 72, borderRadius: 16,
                        background: colorFor(u),
                        color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800, fontSize: 26,
                        border: "1.5px solid var(--ink-800)",
                      }}
                    >
                      {initialsOf(u) || "?"}
                    </div>
                  )}
                  <div style={{ textAlign: "center", lineHeight: 1.2 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ink-900)" }}>
                      {u.firstName} {u.lastName?.[0] || ""}.
                    </div>
                    {u.role && (
                      <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 600 }}>
                        {u.role}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <PinPad
            user={picked}
            pin={pin}
            tap={tap}
            back={back}
            onSubmit={submit}
            onCancel={() => { setPicked(null); setPin(""); }}
            isSubmitting={isSubmitting}
          />
        )}

        {/* Manager fallback */}
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1.5px solid var(--ink-100)", textAlign: "center" }}>
          <button
            type="button"
            onClick={onUseEmailLogin}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink-500)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Use email + password instead (manager)
          </button>
        </div>
      </div>
    </div>
  );
}

function TerminalBar({ terminal, onSwitch }) {
  if (!terminal) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "var(--aero-orange-50)",
        border: "1.5px solid var(--aero-orange-300)",
        borderRadius: 12,
      }}
    >
      <span
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: "var(--aero-orange-500)",
          color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 12,
          border: "1.5px solid var(--ink-800)",
          flexShrink: 0,
        }}
      >
        {String(terminal.deviceName || "?").slice(0, 2).toUpperCase()}
      </span>
      <div style={{ flex: 1, lineHeight: 1.2, textAlign: "left" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--ink-900)" }}>
          {terminal.deviceName}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-600)", fontWeight: 600 }}>
          {terminal.locationName || `Location ${terminal.locationId}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onSwitch}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--ink-500)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          textDecoration: "underline",
          padding: 4,
        }}
      >
        Switch
      </button>
    </div>
  );
}

function PinPad({ user, pin, tap, back, onSubmit, onCancel, isSubmitting }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20 }}>
      {/* Picked staff */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
        {user.photoUrl ? (
          <img
            src={user.photoUrl}
            alt=""
            style={{
              width: 84, height: 84, borderRadius: 20,
              objectFit: "cover",
              border: "2px solid var(--ink-800)",
              boxShadow: "0 5px 0 var(--ink-800)",
            }}
          />
        ) : (
          <div
            style={{
              width: 84, height: 84, borderRadius: 20,
              background: colorFor(user),
              color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800, fontSize: 32,
              border: "2px solid var(--ink-800)",
              boxShadow: "0 5px 0 var(--ink-800)",
            }}
          >
            {initialsOf(user) || "?"}
          </div>
        )}
        <div style={{ marginTop: 10, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--ink-900)" }}>
          {user.firstName} {user.lastName}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>
          Enter your 4-digit PIN
        </div>
      </div>

      {/* PIN dots */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 16, height: 16, borderRadius: 999,
              background: i < pin.length ? "var(--aero-orange-500)" : "transparent",
              border: "2px solid var(--ink-800)",
            }}
          />
        ))}
      </div>

      {/* Pad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 10, marginBottom: 14 }}>
        {[1,2,3,4,5,6,7,8,9].map((d) => (
          <PadButton key={d} onClick={() => tap(String(d))} disabled={isSubmitting}>{d}</PadButton>
        ))}
        <PadButton onClick={back} disabled={isSubmitting} muted>←</PadButton>
        <PadButton onClick={() => tap("0")} disabled={isSubmitting}>0</PadButton>
        <PadButton onClick={onCancel} disabled={isSubmitting} muted>✕</PadButton>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || pin.length !== PIN_LENGTH}
        className="a-btn a-btn--primary"
        style={{ width: 236, justifyContent: "center", marginBottom: 10 }}
      >
        {isSubmitting ? "Signing in…" : "Clock in"}
      </button>

      <div style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 600 }}>
        Enter all 4 digits, then tap Clock in
      </div>
    </div>
  );
}

function PadButton({ children, onClick, disabled, muted }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        all: "unset",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: muted ? "var(--ink-50)" : "white",
        color: muted ? "var(--ink-700)" : "var(--ink-900)",
        border: "2px solid var(--ink-800)",
        borderRadius: 14,
        boxShadow: "0 4px 0 var(--ink-800)",
        width: 72, height: 72,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 26,
        userSelect: "none",
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(4px)"; }}
      onMouseUp={(e) => (e.currentTarget.style.transform = "")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
    >
      {children}
    </button>
  );
}

function StaffLoadError({ error, pairingRejected, onRetry, onPairAgain }) {
  return (
    <div
      role="alert"
      style={{
        padding: 18,
        background: "var(--color-danger-soft)",
        border: "1.5px solid var(--color-danger)",
        borderRadius: 12,
        color: "var(--ink-900)",
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 5 }}>
        {pairingRejected ? "This terminal needs to be paired again" : "Staff list couldn't be loaded"}
      </div>
      <div style={{ color: "var(--ink-600)", fontSize: 12.5, lineHeight: 1.45 }}>
        {pairingRejected
          ? "The saved terminal credential is missing, expired, or was revoked by a manager."
          : error?.data?.error || "Check the connection and try again."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {pairingRejected ? (
          <button type="button" onClick={onPairAgain} className="a-btn a-btn--primary a-btn--sm">
            Pair terminal again
          </button>
        ) : (
          <button type="button" onClick={onRetry} className="a-btn a-btn--primary a-btn--sm">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 32,
        background: "var(--ink-25)",
        border: "1.5px dashed var(--ink-300)",
        borderRadius: 14,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 800, color: "var(--ink-900)", marginBottom: 8 }}>
        No eligible staff for this location
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14 }}>
        A manager needs to assign the user to this location, enable POS access, and set a PIN in the admin app:
        <br />
        <em>Users → edit a user → Cashier (POS) access</em>
      </div>
    </div>
  );
}
