import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TurnstileConfig = { enabled: boolean; mode: "managed" | "non-interactive" | "invisible" };

type ZoneState = {
	id: string;
	domain: string;
	accountId: string;
	accountName: string;
	actions: string[];
	defaultAction: string;
	selected: boolean;
	routesToProtect: string[];
	turnstile: TurnstileConfig;
};

type ZoneProtectionStatus = {
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
	zones: ZoneProtectionStatus[];
};

type BannerState = { message: string; type: "success" | "warning" | "error" | "info" } | null;

type ModalCfg =
	| { type: "install"; zones: ZoneProtectionStatus[] }
	| { type: "reinstall"; zones: ZoneProtectionStatus[] }
	| { type: "remove"; zones: ZoneProtectionStatus[] }
	| { type: "remove_all" };

type ProgressMessage = { id: number; step: string; status: "info" | "success" | "error" };

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
	letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
};
const inputStyle: { [key: string]: string | number } = {
	width: "100%", padding: "8px 11px", borderRadius: 5,
	border: `1px solid ${T.border}`, background: T.surface,
	color: T.text, fontSize: 12, fontFamily: "inherit",
	outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string | null {
	if (!iso) return null;
	return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getWsUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/ws`;
}

function runWithWebSocket(
	wsUrl: string,
	message: object,
	onProgress: (step: string, status: "info" | "success" | "error") => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		let settled = false;
		const done = (err?: Error) => {
			if (settled) return;
			settled = true;
			if (err) reject(err);
			else resolve();
		};
		ws.onopen = () => ws.send(JSON.stringify(message));
		ws.onmessage = (event: MessageEvent<string>) => {
			const data = JSON.parse(event.data) as {
				type: string; step?: string;
				status?: "info" | "success" | "error";
				success?: boolean; error?: string;
			};
			if (data.type === "progress" && data.step && data.status) {
				onProgress(data.step, data.status);
			} else if (data.type === "done") {
				ws.close();
				done(data.success ? undefined : new Error(data.error ?? "Operation failed"));
			}
		};
		ws.onerror = () => done(new Error("WebSocket connection error"));
		ws.onclose = () => { if (!settled) done(new Error("Connection closed unexpectedly")); };
	});
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

// ─── IdChip ───────────────────────────────────────────────────────────────────

function IdChip({ id, label }: { id: string; label: string }) {
	const [rev, setRev] = useState(false);
	const [cop, setCop] = useState(false);
	const t = useRef<ReturnType<typeof setTimeout> | null>(null);
	const click = (e: MouseEvent) => {
		e.stopPropagation();
		if (!rev) {
			setRev(true);
			if (t.current) clearTimeout(t.current);
			t.current = setTimeout(() => setRev(false), 6000);
		} else {
			navigator.clipboard?.writeText(id).catch(() => {});
			setCop(true);
			setTimeout(() => { setCop(false); setRev(false); }, 1500);
		}
	};
	return (
		<button onClick={click} style={{
			display: "inline-flex", alignItems: "center", gap: 4,
			padding: "1px 6px 1px 5px", borderRadius: 3,
			background: rev ? "#fff7ee" : T.panel,
			border: `1px solid ${rev ? T.orangeBd : T.border}`,
			color: rev ? (cop ? T.green : T.orangeDk) : T.textMute,
			fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
			cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
		}}>
			<span style={{ color: T.textFaint, fontSize: 8, fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
			{rev
				? <span>{cop ? "copied!" : id}</span>
				: <><span style={{ color: T.textMid }}>{id.slice(0, 4)}</span><span style={{ color: T.textGhost, letterSpacing: "0.1em" }}>••••</span></>
			}
		</button>
	);
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

function Tag({ children, color = T.textMid, bg, bd }: {
	children: React.ReactNode; color?: string; bg?: string; bd?: string;
}) {
	return (
		<span style={{
			fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
			padding: "2px 6px", borderRadius: 3,
			background: bg ?? `${color}14`, border: `1px solid ${bd ?? `${color}30`}`, color,
		}}>{children}</span>
	);
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({ banner, onDismiss }: { banner: BannerState; onDismiss: () => void }) {
	if (!banner) return null;
	const c = ({
		success: { bg: T.greenBg, border: T.greenBd, text: T.green },
		warning: { bg: T.orangeBg, border: T.orangeBd, text: T.orangeDk },
		error:   { bg: T.redBg,   border: T.redBd,   text: T.red },
		info:    { bg: T.blueBg,  border: T.blueBd,  text: T.blue },
	} as const)[banner.type];
	return (
		<div style={{
			background: c.bg, borderBottom: `1px solid ${c.border}`,
			padding: "8px 22px", display: "flex", alignItems: "center",
			justifyContent: "space-between",
		}}>
			<span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>{banner.message}</span>
			<button onClick={onDismiss} style={{
				background: "none", border: "none", color: c.text,
				cursor: "pointer", fontSize: 13, opacity: 0.6, padding: 0,
			}}>✕</button>
		</div>
	);
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function Modal({ cfg, onConfirm, onCancel }: {
	cfg: ModalCfg | null;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	if (!cfg) return null;

	const zones = cfg.type !== "remove_all" ? cfg.zones : [];
	const danger = cfg.type === "remove" || cfg.type === "remove_all";
	const color = danger ? T.red : T.orange;

	const title =
		cfg.type === "install"    ? `Enable protection on ${zones.length} zone${zones.length !== 1 ? "s" : ""}` :
		cfg.type === "reinstall"  ? `Reinstall on ${zones.length} zone${zones.length !== 1 ? "s" : ""}` :
		cfg.type === "remove"     ? `Remove protection from ${zones.length} zone${zones.length !== 1 ? "s" : ""}` :
		"Remove all CrowdSec infrastructure";

	const action =
		cfg.type === "install"   ? "Enable" :
		cfg.type === "reinstall" ? "Reinstall" :
		cfg.type === "remove"    ? "Remove" :
		"Remove everything";

	const note =
		cfg.type === "install"    ? "Worker routes will be created. Traffic on these zones will go through the CrowdSec bouncer." :
		cfg.type === "reinstall"  ? "Both worker scripts will be updated to the latest version. Zone bindings, KV and D1 stay intact." :
		cfg.type === "remove"     ? "Worker routes will be deleted for these zones. Workers, KV and D1 are kept — re-enable at any time." :
		"Removes both workers, KV and D1. All zones lose protection immediately. This cannot be undone.";

	return (
		<div style={{
			position: "fixed", inset: 0, background: "rgba(20,24,32,0.45)",
			zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center",
			padding: 24, backdropFilter: "blur(2px)",
		}}>
			<div style={{
				background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
				padding: 22, width: "100%", maxWidth: 420,
				boxShadow: "0 18px 50px rgba(20,24,32,0.18)",
			}}>
				<div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 12 }}>{title}</div>
				{zones.length > 0 && (
					<div style={{
						background: T.panel, borderRadius: 5, border: `1px solid ${T.border}`,
						marginBottom: 12, maxHeight: 140, overflowY: "auto",
					}}>
						{zones.map((z, i) => (
							<div key={z.zoneId} style={{
								padding: "6px 11px",
								borderBottom: i < zones.length - 1 ? `1px solid ${T.border}` : "none",
								fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: T.text,
							}}>{z.domain}</div>
						))}
					</div>
				)}
				<div style={{
					padding: "9px 12px", borderRadius: 5,
					background: danger ? T.redBg : T.orangeBg,
					border: `1px solid ${danger ? T.redBd : T.orangeBd}`,
					fontSize: 11.5, color: T.textMid, lineHeight: 1.55, marginBottom: 16,
				}}>{note}</div>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button onClick={onCancel} style={{
						padding: "7px 14px", borderRadius: 5, border: `1px solid ${T.border}`,
						background: "transparent", color: T.textMid,
						fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
					}}>Cancel</button>
					<button onClick={onConfirm} style={{
						padding: "7px 16px", borderRadius: 5, border: "none",
						background: color, color: "#fff",
						fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
					}}>{action}</button>
				</div>
			</div>
		</div>
	);
}

// ─── Progress Log ─────────────────────────────────────────────────────────────

function ProgressLog({ messages }: { messages: ProgressMessage[] }) {
	const endRef = useRef<HTMLDivElement>(null);
	useEffect(() => { endRef.current?.scrollIntoView({ behavior: "instant" }); }, [messages]);
	if (messages.length === 0) return null;
	return (
		<div style={{
			borderRadius: 5, border: `1px solid ${T.border}`,
			background: T.panel, padding: "10px 12px",
			maxHeight: 200, overflowY: "auto",
			fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
		}}>
			{messages.map((m) => (
				<div key={m.id} style={{
					display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 3,
					color: m.status === "success" ? T.green : m.status === "error" ? T.red : T.textMute,
				}}>
					<span style={{ flexShrink: 0 }}>
						{m.status === "success" ? "✓" : m.status === "error" ? "✗" : "›"}
					</span>
					<span>{m.step}</span>
				</div>
			))}
			<div ref={endRef} />
		</div>
	);
}

// ─── Section 1 — CF Token ─────────────────────────────────────────────────────

const CF_TOKEN_PERMS_URL =
	"https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22challenge_widgets%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22user_details%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%20%22dns%22%2C%20%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%22d1%22%2C%20%22type%22%3A%22edit%22%7D%5D&name=";

function CfTokenSection({
	token, setToken, tokenState, onBlur,
}: {
	token: string;
	setToken: (v: string) => void;
	tokenState: "idle" | "checking" | "valid" | "error";
	onBlur: () => void;
}) {
	const [open, setOpen] = useState(true);
	const isValid = tokenState === "valid";
	const borderColor = isValid ? T.greenBd : tokenState === "error" ? T.redBd : T.border;

	return (
		<div style={{ borderBottom: `1px solid ${T.border}` }}>
			{/* Section header */}
			<button onClick={() => setOpen((o) => !o)} style={{
				width: "100%", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
				background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
			}}
				onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.panel; }}
				onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
			>
				<div style={{
					width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
					display: "flex", alignItems: "center", justifyContent: "center",
					background: isValid ? T.greenBg : open ? T.orangeBg : T.panelAlt,
					border: `1px solid ${isValid ? T.greenBd : open ? T.orangeBd : T.border}`,
					fontSize: 10, fontWeight: 800,
					color: isValid ? T.green : open ? T.orange : T.textMute,
				}}>
					{isValid ? "✓" : tokenState === "checking" ? <Spinner size={9} color={T.orange} /> : "1"}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontSize: 13, fontWeight: 700, color: open ? T.text : T.textMid }}>Cloudflare API Token</div>
					{!open && isValid && (
						<div style={{ fontSize: 11.5, color: T.textMute, marginTop: 1, fontFamily: "'JetBrains Mono',monospace" }}>
							{token.slice(0, 8)}••••••••
						</div>
					)}
				</div>
				<span style={{ color: T.textFaint, fontSize: 10, transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}>▾</span>
			</button>

			<div style={{ overflow: "hidden", maxHeight: open ? "700px" : "0px", transition: open ? "max-height 0.35s ease" : "max-height 0.25s ease" }}>
				<div style={{ padding: "2px 18px 16px" }}>
					<div style={{ marginBottom: 12 }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
							<label style={labelStyle}>API Token</label>
							<a href={CF_TOKEN_PERMS_URL} target="_blank" rel="noreferrer"
								style={{ fontSize: 11, color: T.orange, textDecoration: "none", fontWeight: 600 }}>
								Create token ↗
							</a>
						</div>
						<div style={{ position: "relative" }}>
							<input
								value={token}
								onChange={(e) => setToken(e.target.value)}
								onBlur={onBlur}
								type="password"
								placeholder="Paste your Cloudflare API token…"
								onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = T.orange; }}
								style={{ ...inputStyle, borderColor, paddingRight: 34 }}
							/>
							<div style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }}>
								{tokenState === "checking" && <Spinner />}
								{tokenState === "valid"    && <span style={{ color: T.green, fontSize: 13 }}>✓</span>}
								{tokenState === "error"    && <span style={{ color: T.red,   fontSize: 13 }}>✗</span>}
							</div>
						</div>
						<div style={{ marginTop: 5, fontSize: 11, minHeight: 15, color: isValid ? T.green : tokenState === "error" ? T.red : T.textFaint }}>
							{tokenState === "idle" && !token.trim() && "Awaiting token…"}
							{tokenState === "checking" && <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.textMute }}><Spinner size={9} />Verifying…</span>}
							{isValid && "✓ Token valid — permissions confirmed"}
							{tokenState === "error" && <>✗ Invalid or insufficient permissions — <a href="https://doc.crowdsec.net/u/bouncers/cloudflare-workers/" target="_blank" rel="noreferrer" style={{ color: T.red }}>see docs</a></>}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Section 2 — CrowdSec Endpoint ───────────────────────────────────────────

function CrowdSecSection({
	enabled, csUrl, setCsUrl, csKey, setCsKey, saved, onSave,
}: {
	enabled: boolean;
	csUrl: string; setCsUrl: (v: string) => void;
	csKey: string; setCsKey: (v: string) => void;
	saved: boolean;
	onSave: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [showKey, setShowKey] = useState(false);
	const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "error">("idle");

	useEffect(() => { if (enabled && !saved) setOpen(true); }, [enabled, saved]);

	async function handleTest() {
		if (!csUrl.trim()) return;
		setTestState("testing");
		try {
			const res = await fetch(`${csUrl.trim()}/v1/decisions?type=ban&limit=1`, {
				headers: { "X-Api-Key": csKey.trim() },
			});
			setTestState(res.ok || res.status === 200 ? "ok" : "error");
		} catch {
			setTestState("error");
		}
	}

	const canSave = csUrl.trim() !== "" && csKey.trim() !== "";
	const isValid = saved && canSave;
	const hostLabel = isValid ? (() => { try { return new URL(csUrl).host; } catch { return csUrl; } })() : null;

	return (
		<div style={{ borderBottom: `1px solid ${T.border}` }}>
			<button onClick={() => enabled && setOpen((o) => !o)} style={{
				width: "100%", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
				background: "transparent", border: "none", cursor: enabled ? "pointer" : "default",
				textAlign: "left", opacity: enabled ? 1 : 0.55,
			}}
				onMouseEnter={(e) => { if (enabled) (e.currentTarget as HTMLButtonElement).style.background = T.panel; }}
				onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
			>
				<div style={{
					width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
					display: "flex", alignItems: "center", justifyContent: "center",
					background: isValid ? T.greenBg : open ? T.orangeBg : T.panelAlt,
					border: `1px solid ${isValid ? T.greenBd : open ? T.orangeBd : T.border}`,
					fontSize: 10, fontWeight: 800,
					color: isValid ? T.green : open ? T.orange : T.textMute,
				}}>
					{isValid ? "✓" : "2"}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontSize: 13, fontWeight: 700, color: open ? T.text : T.textMid }}>CrowdSec Endpoint</div>
					{!open && hostLabel && (
						<div style={{ fontSize: 11.5, color: T.textMute, marginTop: 1, fontFamily: "'JetBrains Mono',monospace" }}>{hostLabel}</div>
					)}
				</div>
				{enabled && <span style={{ color: T.textFaint, fontSize: 10, transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}>▾</span>}
			</button>

			<div style={{ overflow: "hidden", maxHeight: open ? "600px" : "0px", transition: open ? "max-height 0.35s ease" : "max-height 0.25s ease" }}>
				<div style={{ padding: "2px 18px 16px" }}>
					<div style={{ marginBottom: 12 }}>
						<label style={{ ...labelStyle, marginBottom: 5, display: "block" }}>LAPI URL</label>
						<div style={{ display: "flex", gap: 6 }}>
							<input
								value={csUrl} onChange={(e) => { setCsUrl(e.target.value); setTestState("idle"); }}
								placeholder="https://lapi.example.com"
								onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = T.orange; }}
								onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = T.border; }}
								style={{ ...inputStyle, flex: 1 }}
							/>
							<button onClick={handleTest} disabled={!csUrl.trim()} style={{
								padding: "0 14px", borderRadius: 5,
								border: `1px solid ${testState === "ok" ? T.greenBd : T.border}`,
								background: testState === "ok" ? T.greenBg : T.surface,
								color: testState === "ok" ? T.green : testState === "error" ? T.red : T.textMid,
								fontSize: 11.5, fontWeight: 600,
								cursor: csUrl.trim() ? "pointer" : "not-allowed",
								fontFamily: "inherit", whiteSpace: "nowrap",
								display: "flex", alignItems: "center", gap: 6,
							}}>
								{testState === "testing" && <Spinner size={9} />}
								{testState === "ok" ? "✓ OK" : testState === "error" ? "✗ Failed" : "Test"}
							</button>
						</div>
					</div>
					<div style={{ marginBottom: 14 }}>
						<label style={{ ...labelStyle, marginBottom: 5, display: "block" }}>API Key</label>
						<div style={{ position: "relative" }}>
							<input
								value={csKey} onChange={(e) => setCsKey(e.target.value)}
								type={showKey ? "text" : "password"} placeholder="cs_live_••••••••"
								onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = T.orange; }}
								onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = T.border; }}
								style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, paddingRight: 48 }}
							/>
							<button onClick={() => setShowKey((v) => !v)} style={{
								position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
								background: "none", border: "none", color: T.textFaint, cursor: "pointer",
								fontSize: 9, letterSpacing: "0.06em", fontFamily: "inherit", fontWeight: 700,
							}}>{showKey ? "HIDE" : "SHOW"}</button>
						</div>
					</div>
					<button onClick={onSave} disabled={!canSave} style={{
						padding: "8px 18px", borderRadius: 5, border: "none",
						background: canSave ? T.orange : T.panelAlt,
						color: canSave ? "#fff" : T.textFaint,
						fontSize: 12, fontWeight: 700,
						cursor: canSave ? "pointer" : "not-allowed", fontFamily: "inherit",
					}}>Save endpoint</button>
				</div>
			</div>
		</div>
	);
}

// ─── Zone row ─────────────────────────────────────────────────────────────────

function ZoneRow({ zone, selected, operating, onToggle, onInstall, onRemove }: {
	zone: ZoneProtectionStatus;
	selected: boolean;
	operating: boolean;
	onToggle: () => void;
	onInstall: () => void;
	onRemove: () => void;
}) {
	return (
		<div style={{
			background: selected ? T.orangeBg : T.surface,
			border: `1px solid ${selected ? T.orangeBd : T.border}`,
			borderRadius: 5, padding: "8px 12px",
			display: "flex", alignItems: "center", gap: 10,
			transition: "all 0.12s", position: "relative", overflow: "hidden",
			opacity: operating ? 0.6 : 1,
		}}>
			{zone.bound && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: T.green, borderRadius: "5px 0 0 5px" }} />}

			{/* Checkbox */}
			<div onClick={onToggle} style={{
				width: 13, height: 13, borderRadius: 2, flexShrink: 0, cursor: "pointer",
				border: `1px solid ${selected ? T.orange : T.borderHi}`,
				background: selected ? T.orange : T.surface,
				display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
			}}>
				{selected && <span style={{ color: "#fff", fontSize: 8, fontWeight: 900 }}>✓</span>}
			</div>

			{/* Info */}
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: zone.bound ? 4 : 0, flexWrap: "wrap" }}>
					<span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono',monospace" }}>{zone.domain}</span>
					<span style={{
						fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", padding: "1px 6px", borderRadius: 3,
						background: zone.bound ? T.greenBg : T.panel,
						border: `1px solid ${zone.bound ? T.greenBd : T.border}`,
						color: zone.bound ? T.green : T.textMute,
						display: "inline-flex", alignItems: "center", gap: 3,
					}}>
						<span style={{ width: 4, height: 4, borderRadius: "50%", background: zone.bound ? T.green : T.textFaint }} />
						{zone.bound ? "PROTECTED" : "UNPROTECTED"}
					</span>
					<IdChip id={zone.zoneId} label="zone" />
				</div>
				{zone.bound && (
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						{zone.kvId && <IdChip id={zone.kvId} label="kv" />}
						{zone.d1Id && <IdChip id={zone.d1Id} label="d1" />}
						{zone.turnstileWidgetId && <IdChip id={zone.turnstileWidgetId} label="ts" />}
					</div>
				)}
			</div>

			{/* Action button */}
			<div style={{ flexShrink: 0 }}>
				{operating
					? <span style={{ fontSize: 10, color: T.textMute, display: "flex", alignItems: "center", gap: 5 }}><Spinner size={9} />…</span>
					: zone.bound
						? <RowBtn label="Remove" color={T.red} onClick={onRemove} />
						: <RowBtn label="Install" color={T.orange} onClick={onInstall} />
				}
			</div>
		</div>
	);
}

function RowBtn({ label, color, onClick, disabled }: {
	label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
	const [h, setH] = useState(false);
	return (
		<button onClick={onClick} disabled={disabled}
			onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
			style={{
				padding: "3px 11px", borderRadius: 4,
				border: `1px solid ${disabled ? T.border : h ? color : T.borderHi}`,
				background: h && !disabled ? `${color}10` : T.surface,
				color: disabled ? T.textGhost : h ? color : T.textMid,
				fontSize: 10.5, fontWeight: 700,
				cursor: disabled ? "not-allowed" : "pointer",
				fontFamily: "inherit", transition: "all 0.12s", letterSpacing: "0.02em",
			}}>{label}</button>
	);
}

// ─── Workers info dot ─────────────────────────────────────────────────────────

function WorkersDot({ workers }: { workers: Array<{ name: string; createdOn: string | null; modifiedOn: string | null }> }) {
	const [visible, setVisible] = useState(false);
	const hasWorkers = workers.length > 0;
	return (
		<span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
		>
			<span style={{
				width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
				background: T.blueBg, border: `1px solid ${T.blueBd}`,
				display: "inline-flex", alignItems: "center", justifyContent: "center",
				fontSize: 8, fontWeight: 800, color: T.blue, cursor: "default", letterSpacing: 0,
			}}>i</span>
			{visible && (
				<div style={{
					position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
					background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
					boxShadow: "0 6px 24px rgba(20,24,32,0.12)",
					padding: "10px 12px", minWidth: 260, maxWidth: 340,
				}}>
					<div style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, letterSpacing: "0.08em", marginBottom: 7 }}>
						{hasWorkers ? "CROWDSEC WORKERS DEPLOYED" : "CROWDSEC WORKERS"}
					</div>
					{hasWorkers ? workers.map((w) => (
						<div key={w.name} style={{
							padding: "5px 0",
							borderTop: `1px solid ${T.border}`,
							display: "flex", flexDirection: "column", gap: 2,
						}}>
							<span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono',monospace" }}>{w.name}</span>
							<div style={{ display: "flex", gap: 8 }}>
								{w.createdOn  && <span style={{ fontSize: 10, color: T.textFaint }}>created {fmtDate(w.createdOn)}</span>}
								{w.modifiedOn && <span style={{ fontSize: 10, color: T.textFaint }}>modified {fmtDate(w.modifiedOn)}</span>}
							</div>
						</div>
					)) : (
						<div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 7, fontSize: 11, color: T.textMid, lineHeight: 1.55 }}>
							No workers found. 2 workers will be installed when you enable protection on at least one zone:
							<div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
								{["crowdsec-cloudflare-worker-bouncer", "crowdsec-decisions-sync-worker"].map((name) => (
									<span key={name} style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", color: T.textMute }}>{name}</span>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</span>
	);
}

// ─── Section 3 — Zone Protection Status ──────────────────────────────────────

function ZonesSection({
	enabled, csUrl, csKey, apiToken, onActivity,
}: {
	enabled: boolean;
	csUrl: string;
	csKey: string;
	apiToken: string;
	onActivity: (banner: BannerState) => void;
}) {
	const [open, setOpen] = useState(false);
	const [statusLoading, setStatusLoading] = useState(false);
	const [accounts, setAccounts] = useState<AccountStatus[]>([]);
	const [workers, setWorkers] = useState<Array<{ name: string; createdOn: string | null; modifiedOn: string | null }>>([]);
	const [filter, setFilter] = useState<"all" | "protected" | "unprotected">("all");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [modal, setModal] = useState<ModalCfg | null>(null);
	const [operatingZones, setOperatingZones] = useState<Set<string>>(new Set());
	const [progressMessages, setProgressMessages] = useState<ProgressMessage[]>([]);
	const [globalOp, setGlobalOp] = useState(false);

	const allZones = accounts.flatMap((a) => a.zones);
	const boundCount = allZones.filter((z) => z.bound).length;

	const filtered = allZones
		.filter((z) => {
			const matchFilter = filter === "all" ? true : filter === "protected" ? z.bound : !z.bound;
			return matchFilter && (search === "" || z.domain.toLowerCase().includes(search.toLowerCase()));
		})
		.sort((a, b) => a.domain.localeCompare(b.domain));

	const selZones = allZones.filter((z) => selected.has(z.zoneId));
	const selBound = selZones.filter((z) => z.bound);
	const selUnbound = selZones.filter((z) => !z.bound);
	const allFilteredSel = filtered.length > 0 && filtered.every((z) => selected.has(z.zoneId));

	// Load status + worker list whenever the section becomes enabled
	const loadStatus = useCallback(async (token: string) => {
		setStatusLoading(true);
		setProgressMessages([]);
		try {
			const [statusRes, workersRes] = await Promise.all([
				fetch("/status",  { headers: { Authorization: `Bearer ${token}` } }),
				fetch("/workers", { headers: { Authorization: `Bearer ${token}` } }),
			]);
			const statusData  = await statusRes.json()  as { accounts?: AccountStatus[]; error?: string };
			const workersData = await workersRes.json() as { workers?: Array<{ name: string; createdOn: string | null; modifiedOn: string | null }>; error?: string };
			if (!statusRes.ok || statusData.error) throw new Error(statusData.error ?? `HTTP ${statusRes.status}`);
			setAccounts(statusData.accounts ?? []);
			setWorkers(workersData.workers ?? []);
			setOpen(true);
		} catch (err: unknown) {
			onActivity({ message: `Failed to load zone status: ${err instanceof Error ? err.message : String(err)}`, type: "error" });
		} finally {
			setStatusLoading(false);
		}
	}, [onActivity]);

	useEffect(() => {
		if (enabled && apiToken) loadStatus(apiToken);
	}, [enabled, apiToken, loadStatus]);

	function toZoneState(z: ZoneProtectionStatus): ZoneState {
		return {
			id: z.zoneId, domain: z.domain, accountId: z.accountId, accountName: z.accountName,
			actions: z.actions, defaultAction: z.defaultAction, selected: true,
			routesToProtect: z.routesToProtect,
			turnstile: { enabled: false, mode: "managed" },
		};
	}

	function addProgress(step: string, status: "info" | "success" | "error") {
		setProgressMessages((prev) => [...prev, { id: prev.length, step, status }]);
	}

	async function execInstall(targets: ZoneProtectionStatus[], reinstall = false) {
		setModal(null);
		setOperatingZones(new Set(targets.map((z) => z.zoneId)));
		setProgressMessages([]);
		try {
			await runWithWebSocket(
				getWsUrl(),
				{
					type: "install_zone",
					token: apiToken,
					zones: targets.map(toZoneState),
					crowdsecApiUrl: csUrl,
					crowdsecApiKey: csKey,
				},
				addProgress,
			);
			setSelected(new Set());
			await loadStatus(apiToken);
			const n = targets.length;
			onActivity({
				message: reinstall
					? `Reinstalled on ${n} zone${n !== 1 ? "s" : ""}`
					: `Installed on ${n} zone${n !== 1 ? "s" : ""}`,
				type: "success",
			});
		} catch (err: unknown) {
			onActivity({ message: `Install failed: ${err instanceof Error ? err.message : String(err)}`, type: "error" });
		} finally {
			setOperatingZones(new Set());
		}
	}

	async function execRemove(targets: ZoneProtectionStatus[]) {
		setModal(null);
		setOperatingZones(new Set(targets.map((z) => z.zoneId)));
		setProgressMessages([]);
		try {
			await runWithWebSocket(
				getWsUrl(),
				{ type: "remove_zone", token: apiToken, zones: targets.map(toZoneState) },
				addProgress,
			);
			setSelected(new Set());
			await loadStatus(apiToken);
			const n = targets.length;
			onActivity({ message: `Removed from ${n} zone${n !== 1 ? "s" : ""}`, type: "warning" });
		} catch (err: unknown) {
			onActivity({ message: `Remove failed: ${err instanceof Error ? err.message : String(err)}`, type: "error" });
		} finally {
			setOperatingZones(new Set());
		}
	}

	async function execRemoveAll() {
		setModal(null);
		setGlobalOp(true);
		setProgressMessages([]);
		try {
			const boundZones = allZones.filter((z) => z.bound);
			await runWithWebSocket(
				getWsUrl(),
				{ type: "clean", token: apiToken, zones: boundZones.map(toZoneState) },
				addProgress,
			);
			await loadStatus(apiToken);
			onActivity({ message: "All CrowdSec infrastructure removed", type: "error" });
		} catch (err: unknown) {
			onActivity({ message: `Remove all failed: ${err instanceof Error ? err.message : String(err)}`, type: "error" });
		} finally {
			setGlobalOp(false);
		}
	}

	function handleConfirm() {
		if (!modal) return;
		if (modal.type === "install")   execInstall(modal.zones);
		if (modal.type === "reinstall") execInstall(modal.zones, true);
		if (modal.type === "remove")    execRemove(modal.zones);
		if (modal.type === "remove_all") execRemoveAll();
	}

	function openInstallModal(zones: ZoneProtectionStatus[]) {
		const alreadyBound = zones.filter((z) => z.bound);
		const notBound    = zones.filter((z) => !z.bound);
		if (alreadyBound.length > 0 && notBound.length === 0) {
			setModal({ type: "reinstall", zones: alreadyBound });
		} else if (alreadyBound.length > 0) {
			// Mixed: reinstall bound, install unbound — treat as reinstall for all
			setModal({ type: "reinstall", zones });
		} else {
			setModal({ type: "install", zones: notBound });
		}
	}

	function toggleSel(id: string) {
		setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
	}
	function toggleAll() {
		const ids = filtered.map((z) => z.zoneId);
		const all = ids.every((id) => selected.has(id));
		setSelected((s) => { const n = new Set(s); all ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id)); return n; });
	}

	const sectionLoading = statusLoading || globalOp;

	return (
		<>
			<div style={{ borderBottom: `1px solid ${T.border}` }}>
				{/* Section header */}
				<button onClick={() => enabled && setOpen((o) => !o)} style={{
					width: "100%", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12,
					background: "transparent", border: "none", cursor: enabled ? "pointer" : "default",
					textAlign: "left", opacity: enabled ? 1 : 0.55,
				}}
					onMouseEnter={(e) => { if (enabled) (e.currentTarget as HTMLButtonElement).style.background = T.panel; }}
					onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
				>
					<div style={{
						width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
						display: "flex", alignItems: "center", justifyContent: "center",
						background: open ? T.orangeBg : T.panelAlt,
						border: `1px solid ${open ? T.orangeBd : T.border}`,
						fontSize: 10, fontWeight: 800,
						color: open ? T.orange : T.textMute,
					}}>
						{sectionLoading ? <Spinner size={9} color={T.orange} /> : "3"}
					</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontSize: 13, fontWeight: 700, color: open ? T.text : T.textMid, display: "flex", alignItems: "center", gap: 6 }}>
							Zone Protection
							{enabled && <WorkersDot workers={workers} />}
						</div>
						{!open && enabled && allZones.length > 0 && (
							<div style={{ fontSize: 11.5, color: T.textMute, marginTop: 1 }}>
								{boundCount} of {allZones.length} zones protected
							</div>
						)}
					</div>
					{enabled && <span style={{ color: T.textFaint, fontSize: 10, transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}>▾</span>}
				</button>

				<div style={{ overflow: "hidden", maxHeight: open ? "9999px" : "0px", transition: open ? "max-height 0.35s ease" : "max-height 0.25s ease" }}>
					<div style={{ padding: "2px 18px 16px" }}>
						{sectionLoading && allZones.length === 0 ? (
							<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 0", color: T.textMid, fontSize: 12 }}>
								<Spinner size={12} color={T.orange} />Loading zones…
							</div>
						) : (
							<>
								{/* Toolbar */}
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
									{/* Filter tabs */}
									<div style={{ display: "flex", gap: 3 }}>
										{([["all", "All", allZones.length], ["protected", "Protected", boundCount], ["unprotected", "Unprotected", allZones.length - boundCount]] as const).map(([k, l, n]) => (
											<button key={k} onClick={() => setFilter(k)} style={{
												padding: "4px 10px", borderRadius: 4,
												border: `1px solid ${filter === k ? T.orangeBd : T.border}`,
												background: filter === k ? T.orangeBg : T.surface,
												color: filter === k ? T.orangeDk : T.textMid,
												fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
												display: "flex", alignItems: "center", gap: 4,
											}}>
												{l}
												<span style={{
													fontSize: 9.5, padding: "0 4px", borderRadius: 2,
													background: filter === k ? "rgba(246,130,31,0.16)" : T.panelAlt,
													color: filter === k ? T.orangeDk : T.textMute, fontWeight: 700,
												}}>{n}</span>
											</button>
										))}
									</div>
									{/* Search */}
									<div style={{ position: "relative", flex: 1, minWidth: 160, maxWidth: 240 }}>
										<span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.textFaint, fontSize: 11 }}>⌕</span>
										<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by domain…"
											style={{
												width: "100%", padding: "5px 10px 5px 22px", borderRadius: 4,
												border: `1px solid ${T.border}`, background: T.surface, color: T.text,
												fontSize: 10.5, outline: "none", fontFamily: "'JetBrains Mono',monospace", boxSizing: "border-box",
											}}
										/>
									</div>
									{/* Refresh */}
									<button onClick={() => loadStatus(apiToken)} disabled={sectionLoading} style={{
										padding: "4px 9px", borderRadius: 4, border: `1px solid ${T.border}`,
										background: "transparent", color: T.textMute,
										fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
									}}>↻</button>
									{/* Remove all */}
									{boundCount > 0 && (
										<button onClick={() => setModal({ type: "remove_all" })} disabled={sectionLoading} style={{
											marginLeft: "auto", padding: "4px 10px", borderRadius: 4,
											border: `1px solid ${T.border}`, background: "transparent",
											color: T.textMute, fontSize: 10.5, fontWeight: 700,
											cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em",
										}}
											onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = T.red; b.style.borderColor = T.redBd; b.style.background = T.redBg; }}
											onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = T.textMute; b.style.borderColor = T.border; b.style.background = "transparent"; }}
										>Remove all</button>
									)}
								</div>

								{/* Batch action bar */}
								{selected.size > 0 && (
									<div style={{
										display: "flex", alignItems: "center", gap: 8, padding: "6px 11px",
										borderRadius: 5, background: T.orangeBg, border: `1px solid ${T.orangeBd}`, marginBottom: 9,
									}}>
										<span style={{ fontSize: 11, color: T.text, flex: 1, fontWeight: 600 }}>{selected.size} selected</span>
										{selUnbound.length > 0 && (
											<button onClick={() => openInstallModal(selUnbound)} style={{
												padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.orange}`,
												background: T.orange, color: "#fff", fontSize: 10.5, fontWeight: 700,
												cursor: "pointer", fontFamily: "inherit",
											}}>Install {selUnbound.length}</button>
										)}
										{selBound.length > 0 && (
											<button onClick={() => setModal({ type: "remove", zones: selBound })} style={{
												padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.redBd}`,
												background: T.surface, color: T.red, fontSize: 10.5, fontWeight: 700,
												cursor: "pointer", fontFamily: "inherit",
											}}>Remove {selBound.length}</button>
										)}
										<button onClick={() => setSelected(new Set())} style={{
											background: "none", border: "none", color: T.textMute, cursor: "pointer", fontSize: 12, padding: 0,
										}}>✕</button>
									</div>
								)}

								{/* Select-all row */}
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingLeft: 2 }}>
									<div onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
										<div style={{
											width: 13, height: 13, borderRadius: 2,
											border: `1px solid ${allFilteredSel ? T.orange : T.borderHi}`,
											background: allFilteredSel ? T.orange : T.surface,
											display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
										}}>
											{allFilteredSel && <span style={{ color: "#fff", fontSize: 8, fontWeight: 900 }}>✓</span>}
										</div>
										<span style={{ fontSize: 10, color: T.textMute, fontWeight: 600 }}>Select all visible</span>
									</div>
									<span style={{ fontSize: 10, color: T.textFaint }}>{filtered.length} zone{filtered.length !== 1 ? "s" : ""}</span>
								</div>

								{/* Zone list */}
								<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
									{filtered.map((zone) => (
										<ZoneRow
											key={zone.zoneId}
											zone={zone}
											selected={selected.has(zone.zoneId)}
											operating={operatingZones.has(zone.zoneId)}
											onToggle={() => toggleSel(zone.zoneId)}
											onInstall={() => openInstallModal([zone])}
											onRemove={() => setModal({ type: "remove", zones: [zone] })}
										/>
									))}
									{filtered.length === 0 && (
										<div style={{ textAlign: "center", padding: "26px 0", color: T.textFaint, fontSize: 12 }}>
											{allZones.length === 0 ? "No zones found for this token." : "No zones match."}
										</div>
									)}
								</div>

								{/* Progress log */}
								{progressMessages.length > 0 && (
									<div style={{ marginTop: 12 }}>
										<ProgressLog messages={progressMessages} />
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>

			<Modal cfg={modal} onConfirm={handleConfirm} onCancel={() => setModal(null)} />
		</>
	);
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function ConfigurationPage() {
	const [token, setToken]           = useState("");
	const [tokenState, setTokenState] = useState<"idle" | "checking" | "valid" | "error">("idle");
	const [csUrl, setCsUrl]           = useState("");
	const [csKey, setCsKey]           = useState("");
	const [csSaved, setCsSaved]       = useState(false);
	const [banner, setBanner]         = useState<BannerState>(null);
	const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const tokenValid = tokenState === "valid";

	const showBanner = useCallback((b: BannerState) => {
		setBanner(b);
		if (b) setTimeout(() => setBanner(null), 6000);
	}, []);

	async function verifyToken(val: string) {
		if (!val.trim()) { setTokenState("idle"); return; }
		setTokenState("checking");
		try {
			const res = await fetch("/verify-token", { headers: { Authorization: `Bearer ${val.trim()}` } });
			const data = await res.json() as { valid?: boolean; error?: string };
			setTokenState(data.valid ? "valid" : "error");
		} catch {
			setTokenState("error");
		}
	}

	function handleTokenChange(val: string) {
		setToken(val);
		setTokenState("idle");
		if (debRef.current) clearTimeout(debRef.current);
		debRef.current = setTimeout(() => verifyToken(val), 600);
	}

	function handleTokenBlur() {
		if (token.trim()) verifyToken(token);
	}

	return (
		<div style={{ minHeight: "100vh", background: "#f6f7f9", fontFamily: "'Manrope','Inter','Segoe UI',system-ui,sans-serif", WebkitFontSmoothing: "antialiased" }}>
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
					<div style={{ fontSize: 13, fontWeight: 800, color: T.text, lineHeight: 1.1, letterSpacing: "-0.01em" }}>CrowdSec</div>
					<div style={{ fontSize: 10, color: T.textMute, letterSpacing: "0.04em", marginTop: 1 }}>Cloudflare Worker Bouncer · installer</div>
				</div>
				<a href="https://doc.crowdsec.net/u/bouncers/cloudflare-workers/" target="_blank" rel="noreferrer"
					style={{ fontSize: 11, color: T.textMute, textDecoration: "none", fontWeight: 600, padding: "4px 9px", borderRadius: 4, border: `1px solid ${T.border}` }}>
					Docs ↗
				</a>
			</div>

			<Banner banner={banner} onDismiss={() => setBanner(null)} />

			{/* Accordion */}
			<div style={{ maxWidth: 660, margin: "24px auto", padding: "0 16px" }}>
				<div style={{
					background: T.surface, border: `1px solid ${T.border}`,
					borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(20,24,32,0.04)",
				}}>
					<CfTokenSection
						token={token} setToken={handleTokenChange}
						tokenState={tokenState} onBlur={handleTokenBlur}
					/>
					<CrowdSecSection
						enabled={tokenValid}
						csUrl={csUrl} setCsUrl={setCsUrl}
						csKey={csKey} setCsKey={setCsKey}
						saved={csSaved}
						onSave={() => { setCsSaved(true); }}
					/>
					<ZonesSection
						enabled={tokenValid}
						csUrl={csUrl} csKey={csKey}
						apiToken={token}
						onActivity={showBanner}
					/>
				</div>
				<div style={{ textAlign: "center", padding: "18px 0 32px", fontSize: 10.5, color: T.textFaint }}>
					Token is used only in this session and never stored.
				</div>
			</div>
		</div>
	);
}
