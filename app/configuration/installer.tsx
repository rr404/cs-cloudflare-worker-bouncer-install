import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ZoneStatus = {
  zoneId: string;
  domain: string;
  accountId: string;
  accountName: string;
  bound: boolean;
  kvId: string | null;
  d1Id: string | null;
  turnstileWidgetId: string | null;
  routesToProtect: string[];
  actions: string[];
  defaultAction: string;
};

type AccountStatus = {
  accountId: string;
  accountName: string;
  kvId: string | null;
  d1Id: string | null;
  zones: ZoneStatus[];
};

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
                href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22challenge_widgets%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22user_details%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%20%22dns%22%2C%20%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%22d1%22%2C%20%22type%22%3A%22edit%22%7D%5D&name="
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

function CrowdSecSection({
  enabled, url, setUrl, apiKey, setApiKey, installedUrl,
}: {
  enabled: boolean;
  url: string;
  setUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  installedUrl: string | null | "loading";
}) {
  const [open, setOpen]       = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);

  // Auto-open when it becomes enabled for the first time
  const didAutoOpen = useRef(false);
  if (enabled && !didAutoOpen.current) {
    didAutoOpen.current = true;
    Promise.resolve().then(() => setOpen(true));
  }

  // When a real URL first arrives, pre-fill the url field and leave edit mode
  const prevInstalledUrl = useRef<string | null>(null);
  if (typeof installedUrl === "string" && installedUrl !== "loading" && installedUrl !== prevInstalledUrl.current) {
    prevInstalledUrl.current = installedUrl;
    Promise.resolve().then(() => { setUrl(installedUrl); setEditing(false); });
  }

  const hostLabel = (() => { try { return new URL(url).host; } catch { return null; } })();
  const isLoading    = installedUrl === "loading";
  const showInstalled = typeof installedUrl === "string" && installedUrl !== "loading" && !editing;

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <SectionHeader
        step={2} title="CrowdSec Integration Endpoint"
        subtitle={!open && hostLabel ? hostLabel : undefined}
        open={open} enabled={enabled}
        onToggle={() => setOpen((o) => !o)}
      />

      <div style={{
        overflow: "hidden",
        maxHeight: open ? "400px" : "0px",
        transition: open ? "max-height 0.3s ease" : "max-height 0.2s ease",
      }}>
        <div style={{ padding: "2px 18px 16px" }}>

          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: T.textMute, fontSize: 11 }}>
              <Spinner size={10} color={T.orange} />
              Checking endpoint configuration…
            </div>
          ) : showInstalled ? (
            /* ── Installed view ── */
            <div style={{
              padding: "10px 12px", borderRadius: 5,
              border: `1px solid ${T.greenBd}`, background: T.greenBg,
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 11, color: T.green, fontWeight: 700, marginBottom: 3 }}>
                  {installedUrl}
                </div>
                <div style={{ fontSize: 10.5, color: T.textMute }}>
                  Current endpoint used for protection
                </div>
              </div>
              <button
                onClick={() => setEditing(true)}
                style={{
                  flexShrink: 0, padding: "4px 11px", borderRadius: 4,
                  border: `1px solid ${T.border}`, background: T.surface,
                  color: T.textMid, fontSize: 10.5, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Edit
              </button>
            </div>
          ) : (
            /* ── Edit form ── */
            <>
              {editing && (
                <div style={{ marginBottom: 10, fontSize: 11, color: T.textMute }}>
                  ⚠️ Editing will update the endpoint info on next zone install (for all zones).
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>Endpoint URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
                  placeholder="https://your-lapi.example.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>API Key</label>
                  <div style={{ position: "relative" }}>
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
                      type={showKey ? "text" : "password"}
                      placeholder="cs_live_••••••••"
                      style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace", paddingRight: 52 }}
                    />
                    <button
                      onClick={() => setShowKey((v) => !v)}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", color: T.textFaint,
                        cursor: "pointer", fontSize: 9, letterSpacing: "0.06em",
                        fontFamily: "inherit", fontWeight: 700, padding: 0,
                      }}
                    >
                      {showKey ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>
                {editing && installedUrl && (
                  <button
                    onClick={() => setEditing(false)}
                    style={{
                      alignSelf: "flex-end", padding: "8px 12px", borderRadius: 5,
                      border: `1px solid ${T.border}`, background: "transparent",
                      color: T.textMute, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Section 3 — Zone Protection ─────────────────────────────────────────────

function ZoneRow({ zone }: { zone: ZoneStatus }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 5, padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 10,
      position: "relative", overflow: "hidden",
    }}>
      {zone.bound && (
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
            background: zone.bound ? T.greenBg : T.panel,
            border: `1px solid ${zone.bound ? T.greenBd : T.border}`,
            color: zone.bound ? T.green : T.textMute,
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: zone.bound ? T.green : T.textFaint,
            }} />
            {zone.bound ? "PROTECTED" : "UNPROTECTED"}
          </span>
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
            padding: "1px 6px", borderRadius: 3,
            background: T.panel, border: `1px solid ${T.border}`,
            color: T.textMute, display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ color: T.textFaint, fontSize: 8, fontWeight: 600 }}>zone</span>
            <span style={{ color: T.textMid }}>{zone.zoneId.slice(0, 4)}</span>
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
          {zone.bound ? "Remove" : "Install"}
        </button>
      </div>
    </div>
  );
}

function ZonesSection({
  zones, loading, workersInstalled,
}: {
  zones: ZoneStatus[];
  loading: boolean;
  workersInstalled: boolean | null;
}) {
  const [filter, setFilter] = useState<"all" | "protected" | "unprotected">("all");
  const [search, setSearch] = useState("");

  const allZones = zones;
  const boundCount = allZones.filter((z) => z.bound).length;
  const filtered = allZones
    .filter((z) => {
      const matchFilter = filter === "all" || (filter === "protected" ? z.bound : !z.bound);
      return matchFilter && (search === "" || z.domain.toLowerCase().includes(search.toLowerCase()));
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <SectionHeader step={3} title="Zone Protection" open={zones.length > 0 || loading} enabled={false} />

      <div style={{ padding: "2px 18px 16px" }}>
        {/* Workers status line */}
        {workersInstalled !== null && (
          <div style={{
            marginBottom: 10, fontSize: 11, display: "flex", alignItems: "center", gap: 5,
            color: workersInstalled ? T.green : T.textMute,
          }}>
            <span>{workersInstalled ? "✓" : "·"}</span>
            <span>
              {workersInstalled
                ? "CrowdSec remediation workers installed"
                : "CrowdSec remediation workers will be installed along zone binding"}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: T.textMute, fontSize: 11 }}>
            <Spinner size={10} color={T.orange} />
            Loading zones…
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 3 }}>
                {([["all", "All", allZones.length], ["protected", "Protected", boundCount], ["unprotected", "Unprotected", allZones.length - boundCount]] as const).map(([key, label, count]) => (
                  <button key={key} onClick={() => setFilter(key)} style={{
                    padding: "4px 10px", borderRadius: 4,
                    border: `1px solid ${filter === key ? T.orangeBd : T.border}`,
                    background: filter === key ? T.orangeBg : T.surface,
                    color: filter === key ? T.orangeDk : T.textMid,
                    fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {label}
                    <span style={{
                      fontSize: 9.5, padding: "0 4px", borderRadius: 2,
                      background: filter === key ? "rgba(246,130,31,0.16)" : T.panelAlt,
                      color: filter === key ? T.orangeDk : T.textMute, fontWeight: 700,
                    }}>{count}</span>
                  </button>
                ))}
              </div>

              <div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 240 }}>
                <span style={{
                  position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                  color: T.textFaint, fontSize: 11,
                }}>⌕</span>
                <input
                  value={search}
                  onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
                  placeholder="Filter by domain…"
                  style={{
                    width: "100%", padding: "5px 10px 5px 22px", borderRadius: 4,
                    border: `1px solid ${T.border}`, background: T.surface, color: T.text,
                    fontSize: 10.5, outline: "none", fontFamily: "'JetBrains Mono',monospace",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Count row */}
            <div style={{
              display: "flex", justifyContent: "flex-end",
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 10, color: T.textFaint }}>
                {filtered.length} zone{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Zone list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {filtered.length > 0
                ? filtered.map((zone) => <ZoneRow key={zone.zoneId} zone={zone} />)
                : <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: T.textFaint }}>
                    {allZones.length === 0 ? "No zones found for this token." : "No zones match."}
                  </div>
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function InstallerPage() {
  const [token, setToken]           = useState("");
  const [tokenState, setTokenState] = useState<TokenState>("idle");
  const [csUrl, setCsUrl]                     = useState("");
  const [csKey, setCsKey]                     = useState("");
  const [workersInstalled, setWorkersInstalled] = useState<boolean | null>(null);
  const [installedLapiUrl, setInstalledLapiUrl] = useState<string | null | "loading">(null);
  const [zones, setZones]           = useState<ZoneStatus[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenValid = tokenState === "valid";

  async function verifyToken(val: string) {
    if (!val.trim()) { setTokenState("idle"); setWorkersInstalled(null); setInstalledLapiUrl(null); setZones([]); setZonesLoading(false); return; }
    setTokenState("checking");
    try {
      const res  = await fetch("/verify-token", { headers: { Authorization: `Bearer ${val.trim()}` } });
      const data = await res.json() as { valid?: boolean };
      if (data.valid) {
        setTokenState("valid");
        setInstalledLapiUrl("loading");
        fetch("/workers", { headers: { Authorization: `Bearer ${val.trim()}` } })
          .then((r) => r.json() as Promise<{ workers?: string[] }>)
          .then((d) => {
            const w = d.workers ?? [];
            const installed =
              w.includes("crowdsec-cloudflare-worker-bouncer") &&
              w.includes("crowdsec-decisions-sync-worker");
            setWorkersInstalled(installed);
            if (installed) {
              fetch("/worker-settings", { headers: { Authorization: `Bearer ${val.trim()}` } })
                .then((r) => r.json() as Promise<{ lapiUrl?: string | null }>)
                .then((s) => setInstalledLapiUrl(s.lapiUrl ?? null))
                .catch(() => setInstalledLapiUrl(null));
            } else {
              setInstalledLapiUrl(null);
            }
            // Fetch zone status last — slowest call
            setZonesLoading(true);
            fetch("/status", { headers: { Authorization: `Bearer ${val.trim()}` } })
              .then((r) => r.json() as Promise<{ accounts?: Array<{ zones: ZoneStatus[] }> }>)
              .then((d) => setZones((d.accounts ?? []).flatMap((a) => a.zones)))
              .catch(() => setZones([]))
              .finally(() => setZonesLoading(false));
          })
          .catch(() => { setWorkersInstalled(false); setInstalledLapiUrl(null); setZonesLoading(false); });
      } else {
        setTokenState("error");
        setWorkersInstalled(null);
      }
    } catch {
      setTokenState("error");
      setWorkersInstalled(null);
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
            onChange={handleChange} onBlur={() => { if (tokenState !== "valid") verifyToken(token); }}
          />
          <CrowdSecSection
            enabled={tokenValid}
            url={csUrl} setUrl={setCsUrl}
            apiKey={csKey} setApiKey={setCsKey}
            installedUrl={installedLapiUrl}
          />
          <ZonesSection
            zones={zones} loading={zonesLoading}
            workersInstalled={workersInstalled}
          />
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
