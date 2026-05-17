import { useRef, useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:        "#ffffff",
  surface:   "#ffffff",
  panel:     "#fafbfc",
  panelAlt:  "#f5f6f8",
  border:    "#e3e6ea",
  borderHi:  "#d5d9de",
  text:      "#1c1e21",
  textMid:   "#444950",
  textMute:  "#6b7280",
  textFaint: "#9aa0a8",
  textGhost: "#c2c6cc",
  orange:    "#f6821f",
  orangeDk:  "#d96a0a",
  orangeBg:  "rgba(246,130,31,0.08)",
  orangeBd:  "rgba(246,130,31,0.30)",
  green:     "#1f9d6e",
  greenBg:   "rgba(31,157,110,0.08)",
  greenBd:   "rgba(31,157,110,0.28)",
  red:       "#d63b3b",
  redBg:     "rgba(214,59,59,0.06)",
  redBd:     "rgba(214,59,59,0.28)",
  blue:      "#2563eb",
  blueBg:    "rgba(37,99,235,0.06)",
  blueBd:    "rgba(37,99,235,0.25)",
} as const;

const labelStyle: { [key: string]: string | number } = {
  fontSize: 9.5, fontWeight: 700, color: T.textMute,
  letterSpacing: "0.08em", textTransform: "uppercase",
};
const inputStyle: { [key: string]: string | number } = {
  width: "100%", padding: "8px 11px", borderRadius: 5,
  border: `1px solid ${T.border}`, background: T.surface,
  color: T.text, fontSize: 12, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

// ─── Shared section header button ─────────────────────────────────────────────

function SectionHeader({
  step, title, subtitle, open, enabled = true,
  status = "idle", onToggle,
}: {
  step: number;
  title: string;
  subtitle?: string;
  open: boolean;
  enabled?: boolean;
  status?: "idle" | "valid";
  onToggle?: () => void;
}) {
  const isValid = status === "valid";
  return (
    <button
      onClick={onToggle}
      disabled={!enabled}
      style={{
        width: "100%", padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 12,
        background: "transparent", border: "none",
        cursor: enabled ? "pointer" : "default", textAlign: "left",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      {/* Step circle */}
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isValid ? T.greenBg : open ? T.orangeBg : T.panelAlt,
        border: `1px solid ${isValid ? T.greenBd : open ? T.orangeBd : T.border}`,
        fontSize: 10, fontWeight: 800,
        color: isValid ? T.green : open ? T.orange : T.textMute,
      }}>
        {isValid ? "✓" : step}
      </div>
      {/* Title + subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: open ? T.text : T.textMid }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 1, fontFamily: "'JetBrains Mono',monospace" }}>
            {subtitle}
          </div>
        )}
      </div>
      {/* Chevron */}
      {enabled && (
        <span style={{
          color: T.textFaint, fontSize: 10, flexShrink: 0,
          transform: open ? "rotate(180deg)" : "none",
        }}>▾</span>
      )}
    </button>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 10, color = T.textMute }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `1.5px solid ${color}30`, borderTop: `1.5px solid ${color}`,
      borderRadius: "50%", animation: "spin 0.65s linear infinite", flexShrink: 0,
    }} />
  );
}

// ─── Section 1 — Cloudflare API Token ────────────────────────────────────────

type TokenState = "idle" | "checking" | "valid" | "error";

function CfTokenSection({
  token, tokenState, onChange, onBlur,
}: {
  token: string;
  tokenState: TokenState;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [open, setOpen] = useState(true);
  const isValid = tokenState === "valid";

  const borderColor =
    isValid              ? T.greenBd :
    tokenState === "error" ? T.redBd  : T.border;

  const statusText =
    tokenState === "idle"     && !token.trim() ? { text: "Awaiting token…",                    color: T.textFaint } :
    tokenState === "checking"                  ? null :
    isValid                                    ? { text: "✓ Token valid — permissions confirmed", color: T.green   } :
    tokenState === "error"                     ? { text: "✗ Invalid or insufficient permissions", color: T.red     } :
    null;

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <SectionHeader
        step={1} title="Cloudflare API Token"
        subtitle={!open && isValid ? `${token.slice(0, 8)}••••••••` : undefined}
        open={open} status={isValid ? "valid" : "idle"}
        onToggle={() => setOpen((o) => !o)}
      />

      <div style={{
        overflow: "hidden",
        maxHeight: open ? "300px" : "0px",
        transition: open ? "max-height 0.3s ease" : "max-height 0.2s ease",
      }}>
        <div style={{ padding: "2px 18px 16px" }}>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={labelStyle}>API Token</label>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: T.orange, textDecoration: "none", fontWeight: 600 }}
              >
                Create token ↗
              </a>
            </div>
            <div style={{ position: "relative" }}>
              <input
                value={token}
                onChange={(e) => onChange((e.target as HTMLInputElement).value)}
                onBlur={onBlur}
                type="password"
                placeholder="Paste your Cloudflare API token…"
                style={{ ...inputStyle, borderColor, paddingRight: 34 }}
              />
              <div style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }}>
                {tokenState === "checking" && <Spinner />}
                {isValid                   && <span style={{ color: T.green, fontSize: 13 }}>✓</span>}
                {tokenState === "error"    && <span style={{ color: T.red,   fontSize: 13 }}>✗</span>}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, minHeight: 15 }}>
            {tokenState === "checking"
              ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.textMute }}><Spinner size={9} />Verifying…</span>
              : statusText && <span style={{ color: statusText.color }}>{statusText.text}</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2 — CrowdSec Endpoint ───────────────────────────────────────────

function CrowdSecSection() {
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <SectionHeader step={2} title="CrowdSec Endpoint" open={false} enabled={false} />
    </div>
  );
}

// ─── Section 3 — Zone Protection ─────────────────────────────────────────────

// Static sample zones for layout reference
const SAMPLE_ZONES = [
  { id: "a1b2c3d4", domain: "example.com",    protected: true  },
  { id: "e5f6a7b8", domain: "another.net",    protected: false },
  { id: "c9d0e1f2", domain: "myshop.io",      protected: true  },
  { id: "g3h4i5j6", domain: "staging.dev",    protected: false },
];

function ZoneRow({ zone }: { zone: typeof SAMPLE_ZONES[number] }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 5, padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 10,
      position: "relative", overflow: "hidden",
    }}>
      {/* Protected indicator stripe */}
      {zone.protected && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
          background: T.green, borderRadius: "5px 0 0 5px",
        }} />
      )}

      {/* Checkbox placeholder */}
      <div style={{
        width: 13, height: 13, borderRadius: 2, flexShrink: 0,
        border: `1px solid ${T.borderHi}`, background: T.surface,
      }} />

      {/* Domain + status badge */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: T.text,
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            {zone.domain}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            padding: "1px 6px", borderRadius: 3,
            background: zone.protected ? T.greenBg : T.panel,
            border: `1px solid ${zone.protected ? T.greenBd : T.border}`,
            color: zone.protected ? T.green : T.textMute,
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: zone.protected ? T.green : T.textFaint,
            }} />
            {zone.protected ? "PROTECTED" : "UNPROTECTED"}
          </span>
          {/* Zone ID chip */}
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
            padding: "1px 6px", borderRadius: 3,
            background: T.panel, border: `1px solid ${T.border}`,
            color: T.textMute, display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ color: T.textFaint, fontSize: 8, fontWeight: 600 }}>zone</span>
            <span style={{ color: T.textMid }}>{zone.id.slice(0, 4)}</span>
            <span style={{ color: T.textGhost, letterSpacing: "0.1em" }}>••••</span>
          </span>
        </div>
      </div>

      {/* Action button placeholder */}
      <div style={{ flexShrink: 0 }}>
        <button style={{
          padding: "3px 11px", borderRadius: 4,
          border: `1px solid ${T.borderHi}`,
          background: T.surface, color: T.textMid,
          fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          {zone.protected ? "Remove" : "Install"}
        </button>
      </div>
    </div>
  );
}

function ZonesSection() {
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <SectionHeader step={3} title="Zone Protection" open={true} enabled={false} />

      <div style={{ padding: "2px 18px 16px" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 3 }}>
            {["All", "Protected", "Unprotected"].map((label, i) => (
              <button key={label} style={{
                padding: "4px 10px", borderRadius: 4,
                border: `1px solid ${i === 0 ? T.orangeBd : T.border}`,
                background: i === 0 ? T.orangeBg : T.surface,
                color: i === 0 ? T.orangeDk : T.textMid,
                fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {label}
                <span style={{
                  fontSize: 9.5, padding: "0 4px", borderRadius: 2,
                  background: i === 0 ? "rgba(246,130,31,0.16)" : T.panelAlt,
                  color: i === 0 ? T.orangeDk : T.textMute, fontWeight: 700,
                }}>
                  {i === 0 ? SAMPLE_ZONES.length : i === 1 ? SAMPLE_ZONES.filter((z) => z.protected).length : SAMPLE_ZONES.filter((z) => !z.protected).length}
                </span>
              </button>
            ))}
          </div>

          {/* Search input */}
          <div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 240 }}>
            <span style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              color: T.textFaint, fontSize: 11,
            }}>⌕</span>
            <input
              readOnly placeholder="Filter by domain…"
              style={{
                width: "100%", padding: "5px 10px 5px 22px", borderRadius: 4,
                border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                fontSize: 10.5, outline: "none", fontFamily: "'JetBrains Mono',monospace",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Refresh button */}
          <button style={{
            padding: "4px 9px", borderRadius: 4, border: `1px solid ${T.border}`,
            background: "transparent", color: T.textMute,
            fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>↻</button>
        </div>

        {/* Select-all row */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 6, paddingLeft: 2,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 13, height: 13, borderRadius: 2,
              border: `1px solid ${T.borderHi}`, background: T.surface,
            }} />
            <span style={{ fontSize: 10, color: T.textMute, fontWeight: 600 }}>Select all visible</span>
          </div>
          <span style={{ fontSize: 10, color: T.textFaint }}>{SAMPLE_ZONES.length} zones</span>
        </div>

        {/* Zone list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {SAMPLE_ZONES.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function InstallerPage() {
  const [token, setToken]           = useState("");
  const [tokenState, setTokenState] = useState<TokenState>("idle");
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function verifyToken(val: string) {
    if (!val.trim()) { setTokenState("idle"); return; }
    setTokenState("checking");
    try {
      const res  = await fetch("/verify-token", { headers: { Authorization: `Bearer ${val.trim()}` } });
      const data = await res.json() as { valid?: boolean };
      setTokenState(data.valid ? "valid" : "error");
    } catch {
      setTokenState("error");
    }
  }

  function handleChange(val: string) {
    setToken(val);
    setTokenState("idle");
    if (debRef.current) clearTimeout(debRef.current);
    if (val.trim()) debRef.current = setTimeout(() => verifyToken(val), 600);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f6f7f9",
      fontFamily: "'Manrope','Inter','Segoe UI',system-ui,sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #c2c6cc; }
        button { font-family: inherit; }
        a { text-decoration: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #d5d9de; border-radius: 3px; }
        ::selection { background: rgba(246,130,31,0.20); }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "11px 22px", borderBottom: `1px solid ${T.border}`,
        background: T.surface, display: "flex", alignItems: "center", gap: 11,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: `linear-gradient(135deg,${T.orange},${T.orangeDk})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 13, color: "#fff",
          boxShadow: "0 1px 2px rgba(246,130,31,0.25)",
        }}>C</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
            CrowdSec
          </div>
          <div style={{ fontSize: 10, color: T.textMute, letterSpacing: "0.04em", marginTop: 1 }}>
            Cloudflare Worker Bouncer · installer
          </div>
        </div>
        <a
          href="https://doc.crowdsec.net/u/bouncers/cloudflare-workers/"
          target="_blank" rel="noreferrer"
          style={{
            fontSize: 11, color: T.textMute, fontWeight: 600,
            padding: "4px 9px", borderRadius: 4, border: `1px solid ${T.border}`,
          }}
        >
          Docs ↗
        </a>
      </div>

      {/* Accordion card */}
      <div style={{ maxWidth: 660, margin: "24px auto", padding: "0 16px" }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, overflow: "hidden",
          boxShadow: "0 1px 3px rgba(20,24,32,0.04)",
        }}>
          <CfTokenSection
            token={token} tokenState={tokenState}
            onChange={handleChange} onBlur={() => verifyToken(token)}
          />
          <CrowdSecSection />
          <ZonesSection />
        </div>

        <div style={{
          textAlign: "center", padding: "18px 0 32px",
          fontSize: 10.5, color: T.textFaint,
        }}>
          Token is used only in this session and never stored.
        </div>
      </div>
    </div>
  );
}
