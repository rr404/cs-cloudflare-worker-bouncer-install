const { useState, useRef, useCallback, useEffect } = React;

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_WORKER = {
  installed: true,
  installerVersion: "0.0.3",
  installerInstalledAt: "2026-01-28T14:05:00Z",
  bouncer: {
    name: "crowdsec-cloudflare-worker-bouncer",
    installedAt: "2026-03-12T10:22:00Z",
    version: "0.0.14",
    latestVersion: "0.0.14",
  },
  sync: {
    name: "crowdsec-decisions-sync-worker",
    installedAt: "2026-03-12T10:22:00Z",
    version: "0.0.14",
    latestVersion: "0.0.14",
  },
  kvId: "a1b2c3d4e5f67890abcdef1234567890",
  d1Id: "b2c3d4e5f6789012bcdef1234567890a",
};

const MOCK_ZONES = [
  { id:"z1", name:"api.company.com",    cfZoneId:"b2c3d4e5f67890ab1234567890abcdef", bound:true,  boundSince:"2026-03-12T10:22:00Z", lastSync:"2026-05-16T09:08:00Z", blockedIPs:1203 },
  { id:"z2", name:"blog.example.com",   cfZoneId:"c3d4e5f678901234abcdef567890abcd", bound:false, boundSince:null, lastSync:null, blockedIPs:0 },
  { id:"z3", name:"example.com",        cfZoneId:"a1b2c3d4e5f67890abcdef1234567890", bound:true,  boundSince:"2026-03-12T10:22:00Z", lastSync:"2026-05-16T09:12:00Z", blockedIPs:4821 },
  { id:"z4", name:"internal.tools.net", cfZoneId:"d4e5f6789012345678abcdef90123456", bound:false, boundSince:null, lastSync:null, blockedIPs:0 },
  { id:"z5", name:"myapp.io",           cfZoneId:"e5f67890123456789abcdef012345678", bound:true,  boundSince:"2026-04-01T08:00:00Z", lastSync:"2026-05-16T07:55:00Z", blockedIPs:328 },
  { id:"z6", name:"shop.brand.com",     cfZoneId:"f678901234567890abcdef1234567890", bound:false, boundSince:null, lastSync:null, blockedIPs:0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const wait = ms => new Promise(r => setTimeout(r, ms));
function timeAgo(iso) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

// ─── Tokens (light theme based on doc.crowdsec.net) ───────────────────────────

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
};

// ─── Micro components ─────────────────────────────────────────────────────────

function Spinner({ size=10, color=T.textMute }) {
  return <span style={{display:"inline-block",width:size,height:size,border:`1.5px solid ${color}30`,borderTop:`1.5px solid ${color}`,borderRadius:"50%",animation:"spin 0.65s linear infinite",flexShrink:0}} />;
}

function IdChip({ id, label }) {
  const [rev, setRev] = useState(false);
  const [cop, setCop] = useState(false);
  const t = useRef(null);
  const click = (e) => {
    e.stopPropagation();
    if (!rev) { setRev(true); clearTimeout(t.current); t.current = setTimeout(() => setRev(false), 6000); }
    else { navigator.clipboard?.writeText(id).catch(()=>{}); setCop(true); setTimeout(() => { setCop(false); setRev(false); }, 1500); }
  };
  return (
    <button onClick={click} style={{
      display:"inline-flex",alignItems:"center",gap:4,padding:"1px 6px 1px 5px",borderRadius:3,
      background:rev?"#fff7ee":T.panel,border:`1px solid ${rev?T.orangeBd:T.border}`,
      color:rev?(cop?T.green:T.orangeDk):T.textMute,
      fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap",
    }}>
      <span style={{color:T.textFaint,fontSize:8,fontWeight:600,letterSpacing:"0.04em"}}>{label}</span>
      {rev ? <span>{cop?"copied!":id}</span>
           : <><span style={{color:T.textMid}}>{id.slice(0,4)}</span><span style={{color:T.textGhost,letterSpacing:"0.1em"}}>••••</span></>}
    </button>
  );
}

function Tag({ children, color=T.textMid, bg, bd }) {
  return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.06em",padding:"2px 6px",borderRadius:3,background:bg||`${color}14`,border:`1px solid ${bd||`${color}30`}`,color}}>{children}</span>;
}

function StatPill({ label, value, accent }) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"1px 7px",borderRadius:3,background:T.panel,border:`1px solid ${T.border}`,fontSize:10,color:T.textMute}}>
      <span style={{color:T.textFaint}}>{label}</span>
      <span style={{color:accent?T.green:T.text,fontWeight:600}}>{value}</span>
    </span>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function Modal({ cfg, onConfirm, onCancel }) {
  if (!cfg) return null;
  const { type, zones=[] } = cfg;
  const isUnbind = type==="unbind", isBind = type==="bind", isRemoveWorker = type==="remove_worker", isClearAll = type==="clearall", isReinstall = type==="reinstall_worker";
  const danger = isUnbind||isRemoveWorker||isClearAll;
  const color = danger ? T.red : T.orange;
  const title =
    isRemoveWorker ? "Remove workers entirely?" :
    isClearAll    ? "Clear all zone bindings?" :
    isReinstall   ? "Reinstall both workers?" :
    isBind        ? `Enable protection on ${zones.length} zone${zones.length!==1?"s":""}` :
                    `Disable protection on ${zones.length} zone${zones.length!==1?"s":""}`;
  const action =
    isRemoveWorker ? "Remove everything" :
    isClearAll    ? "Clear all" :
    isReinstall   ? "Reinstall" :
    isBind        ? "Enable" : "Disable protection";
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(20,24,32,0.45)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(2px)"}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:22,width:"100%",maxWidth:420,boxShadow:"0 18px 50px rgba(20,24,32,0.18)"}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:12}}>{title}</div>
        {zones.length>0&&(
          <div style={{background:T.panel,borderRadius:5,border:`1px solid ${T.border}`,marginBottom:12,maxHeight:140,overflowY:"auto"}}>
            {zones.map((z,i)=><div key={z.id} style={{padding:"6px 11px",borderBottom:i<zones.length-1?`1px solid ${T.border}`:"none",fontSize:12,fontFamily:"'JetBrains Mono',monospace",color:T.text}}>{z.name}</div>)}
          </div>
        )}
        <div style={{padding:"9px 12px",borderRadius:5,background:danger?T.redBg:T.orangeBg,border:`1px solid ${danger?T.redBd:T.orangeBd}`,fontSize:11.5,color:T.textMid,lineHeight:1.55,marginBottom:16}}>
          {isUnbind && <><strong style={{color:T.text}}>The worker is not affected.</strong> These zones will no longer benefit from CrowdSec protection. Route bindings can be re-enabled at any time.</>}
          {isBind && <>A route binding will be added — traffic on these zones will go through the CrowdSec worker.</>}
          {isReinstall && <>Updates both worker scripts to the latest version. Zone bindings, KV and D1 stay intact.</>}
          {isRemoveWorker && <><strong style={{color:T.red}}>Removes the workers, KV and D1.</strong> All zones lose protection immediately. This cannot be undone.</>}
          {isClearAll && <>Removes all zone route bindings. The workers, KV and D1 stay in place.</>}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{padding:"7px 14px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:T.textMid,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={onConfirm} style={{padding:"7px 16px",borderRadius:5,border:"none",background:color,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{action}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function Banner({ banner, onDismiss }) {
  if (!banner) return null;
  const c = {
    success:{bg:T.greenBg, border:T.greenBd, text:T.green},
    warning:{bg:T.orangeBg, border:T.orangeBd, text:T.orangeDk},
    error:  {bg:T.redBg,   border:T.redBd,   text:T.red},
  }[banner.type] || {bg:T.blueBg, border:T.blueBd, text:T.blue};
  return (
    <div style={{background:c.bg,borderBottom:`1px solid ${c.border}`,padding:"8px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"slideDown 0.2s ease"}}>
      <span style={{fontSize:12,color:c.text,fontWeight:600}}>{banner.message}</span>
      <button onClick={onDismiss} style={{background:"none",border:"none",color:c.text,cursor:"pointer",fontSize:13,opacity:0.6,padding:0}}>✕</button>
    </div>
  );
}

// ─── Accordion shell ──────────────────────────────────────────────────────────

function Section({ index, title, open, onToggle, summary, status, children, disabled }) {
  return (
    <div style={{borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>!disabled&&onToggle()} style={{
        width:"100%",padding:"12px 18px",display:"flex",alignItems:"center",gap:12,
        background:"transparent",border:"none",cursor:disabled?"default":"pointer",textAlign:"left",
        transition:"background 0.12s",opacity:disabled?0.55:1,
      }}
        onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.background=T.panel; }}
        onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}
      >
        <div style={{
          width:20,height:20,borderRadius:"50%",flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          background: status==="valid" ? T.greenBg : open ? T.orangeBg : T.panelAlt,
          border: `1px solid ${status==="valid" ? T.greenBd : open ? T.orangeBd : T.border}`,
          fontSize:10,fontWeight:800,
          color: status==="valid" ? T.green : open ? T.orange : T.textMute,
          transition:"all 0.2s",
        }}>
          {status==="valid" ? "✓" : status==="loading" ? <Spinner size={9} color={T.orange}/> : index}
        </div>

        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color: open?T.text:T.textMid,letterSpacing:"-0.005em",transition:"color 0.2s"}}>{title}</div>
          {!open && summary && <div style={{fontSize:11.5,color:T.textMute,marginTop:1,fontFamily:"'JetBrains Mono',monospace"}}>{summary}</div>}
        </div>

        {!disabled && (
          <span style={{color:T.textFaint,fontSize:10,transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}>▾</span>
        )}
      </button>

      <div style={{overflow:"hidden", maxHeight: open ? "2000px" : "0px", transition: open ? "max-height 0.35s ease" : "max-height 0.25s ease"}}>
        <div style={{padding:"2px 18px 16px"}}>{children}</div>
      </div>
    </div>
  );
}

// ─── Section 1 — CF Token ─────────────────────────────────────────────────────

function CfTokenSection({ onValid }) {
  const [token, setToken] = useState("");
  const [state, setState] = useState("idle");
  const [open, setOpen] = useState(true);
  const deb = useRef(null);
  const PERMS = "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22challenge_widgets%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%5D&name=CrowdSec+Bouncer";

  const validate = useCallback(async (val) => {
    if (!val.trim()) { setState("idle"); return; }
    setState("checking");
    await wait(900);
    if (val.trim().length > 10) { setState("valid"); onValid(); }
    else setState("error");
  }, [onValid]);

  const onChange = (e) => {
    setToken(e.target.value); setState("idle");
    clearTimeout(deb.current);
    deb.current = setTimeout(() => validate(e.target.value), 600);
  };

  const isValid = state==="valid";
  const borderColor = isValid ? T.greenBd : state==="error" ? T.redBd : T.border;

  return (
    <Section index="1" title="Cloudflare API Token" open={open} onToggle={()=>setOpen(o=>!o)}
      status={isValid?"valid":state==="checking"?"loading":"idle"}
      summary={isValid ? `Token verified · ${token.slice(0,8)}••••••••` : null}
    >
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <label style={labelStyle}>API Token</label>
          <a href={PERMS} target="_blank" rel="noreferrer" style={{fontSize:11,color:T.orange,textDecoration:"none",fontWeight:600}}>Create token ↗</a>
        </div>
        <div style={{position:"relative"}}>
          <input value={token} onChange={onChange} type="password" placeholder="Paste your Cloudflare API token…"
            onFocus={e=>e.target.style.borderColor=T.orange}
            onBlur={e=>{e.target.style.borderColor=borderColor; if(token.trim()) validate(token);}}
            style={{...inputStyle, borderColor, paddingRight:34}}
          />
          <div style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)"}}>
            {state==="checking"&&<Spinner/>}
            {state==="valid"&&<span style={{color:T.green,fontSize:13}}>✓</span>}
            {state==="error"&&<span style={{color:T.red,fontSize:13}}>✗</span>}
          </div>
        </div>
        <div style={{marginTop:5,fontSize:11,minHeight:15,color:isValid?T.green:state==="error"?T.red:T.textMute}}>
          {state==="checking"&&<span style={{color:T.textMute,display:"flex",alignItems:"center",gap:6}}><Spinner size={9}/>Verifying…</span>}
          {isValid&&"✓ Token valid — permissions confirmed"}
          {state==="error"&&<>✗ Invalid or insufficient permissions — <a href="https://doc.crowdsec.net/u/bouncers/cloudflare-workers/" target="_blank" rel="noreferrer" style={{color:T.red}}>see docs</a></>}
        </div>
      </div>
      <div style={{padding:"9px 12px",borderRadius:5,background:T.panel,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:"0.1em",marginBottom:6}}>REQUIRED PERMISSIONS</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {["account_settings:read","challenge_widgets:edit","workers_kv:edit","workers_routes:edit","workers_scripts:edit","zone:read","dns:read","d1:edit"].map(p=>(
            <span key={p} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,background:T.surface,border:`1px solid ${T.border}`,color:T.textMid,fontFamily:"'JetBrains Mono',monospace"}}>{p}</span>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Section 2 — CrowdSec Endpoint ───────────────────────────────────────────

function CrowdSecSection({ enabled, onValid }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState("idle");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (enabled && !saved) setOpen(true); }, [enabled, saved]);

  const test = async () => {
    if (!url.trim()) return;
    setTestState("testing");
    await wait(1000);
    setTestState("ok");
  };

  const save = async () => { setSaved(true); setOpen(false); onValid(); };
  const canSave = url.trim() && key.trim();
  const isValid = saved && canSave;

  return (
    <Section index="2" title="CrowdSec Endpoint" open={open} onToggle={()=>enabled&&setOpen(o=>!o)}
      status={isValid?"valid":"idle"}
      summary={isValid ? `${(()=>{try{return new URL(url).host}catch{return url}})()}` : null}
      disabled={!enabled}
    >
      <div style={{marginBottom:12}}>
        <label style={{...labelStyle,marginBottom:5,display:"block"}}>LAPI URL</label>
        <div style={{display:"flex",gap:6}}>
          <input value={url} onChange={e=>{setUrl(e.target.value);setTestState("idle");}} placeholder="https://lapi.example.com"
            onFocus={e=>e.target.style.borderColor=T.orange}
            onBlur={e=>e.target.style.borderColor=T.border}
            style={{...inputStyle,flex:1}}
          />
          <button onClick={test} disabled={!url.trim()} style={{
            padding:"0 14px",borderRadius:5,border:`1px solid ${testState==="ok"?T.greenBd:T.border}`,
            background:testState==="ok"?T.greenBg:T.surface,
            color:testState==="ok"?T.green:testState==="error"?T.red:T.textMid,
            fontSize:11.5,fontWeight:600,cursor:url.trim()?"pointer":"not-allowed",fontFamily:"inherit",whiteSpace:"nowrap",
            display:"flex",alignItems:"center",gap:6,
          }}>
            {testState==="testing"&&<Spinner size={9}/>}
            {testState==="ok"?"✓ OK":testState==="error"?"✗ Failed":"Test"}
          </button>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{...labelStyle,marginBottom:5,display:"block"}}>API Key</label>
        <div style={{position:"relative"}}>
          <input value={key} onChange={e=>setKey(e.target.value)} type={showKey?"text":"password"}
            placeholder="cs_live_••••••••"
            onFocus={e=>e.target.style.borderColor=T.orange}
            onBlur={e=>e.target.style.borderColor=T.border}
            style={{...inputStyle,fontFamily:"'JetBrains Mono',monospace",fontSize:12,paddingRight:48}}
          />
          <button onClick={()=>setShowKey(v=>!v)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.textFaint,cursor:"pointer",fontSize:9,letterSpacing:"0.06em",fontFamily:"inherit",fontWeight:700}}>{showKey?"HIDE":"SHOW"}</button>
        </div>
      </div>
      <button onClick={save} disabled={!canSave} style={{
        padding:"8px 18px",borderRadius:5,border:"none",
        background:canSave?T.orange:T.panelAlt,
        color:canSave?"#fff":T.textFaint,
        fontSize:12,fontWeight:700,cursor:canSave?"pointer":"not-allowed",fontFamily:"inherit",
      }}>Save endpoint</button>
    </Section>
  );
}

// ─── Section 3 — Workers status ──────────────────────────────────────────────

function WorkerRow({ w, kvId, d1Id }) {
  const outdated = w.version !== w.latestVersion;
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:5,padding:"10px 12px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:(kvId||d1Id)?8:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
          <div style={{position:"relative",width:24,height:24,flexShrink:0}}>
            <div style={{width:24,height:24,borderRadius:5,background:T.greenBg,border:`1px solid ${T.greenBd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.green}}>⚙</div>
            <div style={{position:"absolute",bottom:-1,right:-1,width:7,height:7,borderRadius:"50%",background:T.green,border:`1.5px solid ${T.surface}`}}/>
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:11.5,fontWeight:600,color:T.text,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.name}</div>
            <div style={{fontSize:10,color:T.textMute,marginTop:1}}>deployed {fmtDate(w.installedAt)}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
          {outdated
            ? <><Tag color={T.orangeDk}>v{w.version}</Tag><span style={{fontSize:9,color:T.textFaint}}>→</span><Tag color={T.textMid}>v{w.latestVersion} avail.</Tag></>
            : <Tag color={T.green}>v{w.version}</Tag>
          }
        </div>
      </div>
      {(kvId||d1Id) && (
        <div style={{display:"flex",gap:5,flexWrap:"wrap",paddingTop:7,borderTop:`1px dashed ${T.border}`}}>
          {kvId && <IdChip id={kvId} label="kv"/>}
          {d1Id && <IdChip id={d1Id} label="d1"/>}
        </div>
      )}
    </div>
  );
}

function WorkerSection({ enabled, worker, setWorker, setZones, setBanner }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => { if (enabled) setOpen(true); }, [enabled]);

  const reinstall = async () => {
    setModal(null); setLoading(true);
    await wait(1200);
    const now = new Date().toISOString();
    setWorker(w=>({...w, bouncer:{...w.bouncer, installedAt:now}, sync:{...w.sync, installedAt:now}}));
    setLoading(false);
    setBanner({message:"Both workers reinstalled — all zone bindings preserved", type:"success"});
  };

  const removeWorker = async () => {
    setModal(null); setLoading(true);
    await wait(800);
    setWorker(w=>({...w, installed:false, bouncer:null, sync:null, kvId:null, d1Id:null}));
    setZones(zs=>zs.map(z=>({...z,bound:false,lastSync:null,blockedIPs:0})));
    setLoading(false);
    setBanner({message:"Workers removed — all zones unprotected", type:"error"});
  };

  const handleModalConfirm = () => {
    if (modal?.type==="reinstall_worker") reinstall();
    else if (modal?.type==="remove_worker") removeWorker();
  };

  const installedSummary = worker.installed && worker.bouncer
    ? `bouncer v${worker.bouncer.version} + sync v${worker.sync.version}`
    : null;

  return (
    <React.Fragment>
      <Section index="3" title="Workers Status" open={open} onToggle={()=>enabled&&setOpen(o=>!o)}
        status={enabled?(loading?"loading":worker.installed?"valid":"idle"):"idle"}
        summary={installedSummary}
        disabled={!enabled}
      >
        {loading ? (
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 0",color:T.textMid,fontSize:12}}>
            <Spinner size={12} color={T.orange}/>Applying…
          </div>
        ) : worker.installed && worker.bouncer ? (
          <React.Fragment>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 11px",borderRadius:5,background:T.panel,border:`1px solid ${T.border}`,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:T.textFaint,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700,flexShrink:0}}>Install worker</span>
              <div style={{width:1,height:10,background:T.border,flexShrink:0}}/>
              <Tag color={T.textMid}>v{worker.installerVersion}</Tag>
              <span style={{fontSize:10.5,color:T.textMute}}>first used {fmtDate(worker.installerInstalledAt)}</span>
              <span style={{fontSize:10,color:T.textGhost,marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace"}}>crowdsec-cf-bouncer-install</span>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              <WorkerRow w={worker.bouncer} kvId={worker.kvId} d1Id={worker.d1Id}/>
              <WorkerRow w={worker.sync}/>
            </div>

            <div style={{display:"flex",gap:7}}>
              <WorkerBtn label="Reinstall both" color={T.orange} onClick={()=>setModal({type:"reinstall_worker"})} title="Updates both worker scripts — keeps zone bindings, KV and D1 intact"/>
              <WorkerBtn label="Remove workers" color={T.red} onClick={()=>setModal({type:"remove_worker"})} title="Removes both workers, KV and D1 — all zones lose protection"/>
            </div>
          </React.Fragment>
        ) : (
          <div style={{padding:"11px 13px",borderRadius:5,background:T.panel,border:`1px solid ${T.border}`,fontSize:12,color:T.textMid,lineHeight:1.55}}>
            No CrowdSec workers found on this account. Enable protection on a zone below to install them automatically.
          </div>
        )}
      </Section>
      <Modal cfg={modal} onConfirm={handleModalConfirm} onCancel={()=>setModal(null)}/>
    </React.Fragment>
  );
}

function WorkerBtn({ label, color, onClick, title }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{padding:"5px 12px",borderRadius:4,border:`1px solid ${h?color:T.border}`,background:h?`${color}10`:"transparent",color:h?color:T.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.12s",letterSpacing:"0.02em"}}
    >{label}</button>
  );
}

// ─── Section 4 — Zone protection ──────────────────────────────────────────────

function ZonesSection({ enabled, worker, setWorker, zones, setZones, setBanner }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (enabled) setOpen(true); }, [enabled]);

  const boundCount = zones.filter(z=>z.bound).length;
  const filtered = zones.filter(z=>{
    const mf = filter==="all"?true:filter==="protected"?z.bound:!z.bound;
    return mf && (search===""||z.name.toLowerCase().includes(search.toLowerCase()));
  });
  const selZones = zones.filter(z=>selected.has(z.id));
  const selBound = selZones.filter(z=>z.bound);
  const selUnbound = selZones.filter(z=>!z.bound);
  const allSel = filtered.length>0&&filtered.every(z=>selected.has(z.id));

  const toggleSel = id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll = ()=>{ const ids=filtered.map(z=>z.id); const all=ids.every(id=>selected.has(id)); setSelected(s=>{const n=new Set(s);all?ids.forEach(id=>n.delete(id)):ids.forEach(id=>n.add(id));return n;}); };

  const execBind = async (targets) => {
    setModal(null); setLoading(true);
    await wait(800);
    if (!worker.installed) {
      const now = new Date().toISOString();
      setWorker(w=>({...w, installed:true,
        installerInstalledAt: w.installerInstalledAt || now,
        installerVersion: w.installerVersion || "0.0.3",
        bouncer: { name:"crowdsec-cloudflare-worker-bouncer", installedAt:now, version:"0.0.14", latestVersion:"0.0.14" },
        sync:    { name:"crowdsec-decisions-sync-worker",     installedAt:now, version:"0.0.14", latestVersion:"0.0.14" },
        kvId: "a1b2c3d4e5f67890abcdef1234567890",
        d1Id: "b2c3d4e5f6789012bcdef1234567890a",
      }));
    }
    setZones(zs=>zs.map(z=>targets.find(t=>t.id===z.id)?{...z,bound:true,boundSince:z.boundSince||new Date().toISOString(),lastSync:new Date().toISOString(),blockedIPs:z.blockedIPs||Math.floor(Math.random()*300)+50}:z));
    setSelected(new Set()); setLoading(false);
    setBanner({message:`Protection enabled on ${targets.length} zone${targets.length!==1?"s":""}`, type:"success"});
  };

  const execUnbind = async (targets) => {
    setModal(null); setLoading(true);
    await wait(600);
    setZones(zs=>zs.map(z=>targets.find(t=>t.id===z.id)?{...z,bound:false,lastSync:null,blockedIPs:0}:z));
    setSelected(new Set()); setLoading(false);
    const names = targets.length<=2 ? targets.map(z=>z.name).join(", ") : `${targets.length} zones`;
    setBanner({message:`${names} will no longer benefit from CrowdSec protection`, type:"warning"});
  };

  const execClearAll = async () => {
    setModal(null); setLoading(true);
    await wait(600);
    setZones(zs=>zs.map(z=>({...z,bound:false,lastSync:null,blockedIPs:0})));
    setLoading(false);
    setBanner({message:"All zone bindings removed — workers still installed", type:"warning"});
  };

  const handleConfirm = () => {
    if (!modal) return;
    if (modal.type==="bind") execBind(modal.zones);
    else if (modal.type==="unbind") execUnbind(modal.zones);
    else if (modal.type==="clearall") execClearAll();
  };

  const summary = !open && enabled ? `${boundCount} of ${zones.length} zones protected` : null;

  return (
    <React.Fragment>
      <Section index="4" title="Zone Protection" open={open} onToggle={()=>enabled&&setOpen(o=>!o)}
        status="idle" summary={summary} disabled={!enabled}
      >
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:3}}>
            {[["all","All",zones.length],["protected","Protected",boundCount],["unprotected","Unprotected",zones.length-boundCount]].map(([k,l,n])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{
                padding:"4px 10px",borderRadius:4,
                border:`1px solid ${filter===k?T.orangeBd:T.border}`,
                background:filter===k?T.orangeBg:T.surface,
                color:filter===k?T.orangeDk:T.textMid,
                fontSize:10.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                display:"flex",alignItems:"center",gap:4,
              }}>
                {l}
                <span style={{fontSize:9.5,padding:"0 4px",borderRadius:2,background:filter===k?"rgba(246,130,31,0.16)":T.panelAlt,color:filter===k?T.orangeDk:T.textMute,fontWeight:700}}>{n}</span>
              </button>
            ))}
          </div>
          <div style={{position:"relative",flex:1,minWidth:160,maxWidth:240}}>
            <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:T.textFaint,fontSize:11}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter by domain…"
              style={{width:"100%",padding:"5px 10px 5px 22px",borderRadius:4,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:10.5,outline:"none",fontFamily:"'JetBrains Mono',monospace",boxSizing:"border-box"}}
            />
          </div>
          {boundCount>0&&(
            <button onClick={()=>setModal({type:"clearall",zones:[]})}
              style={{marginLeft:"auto",padding:"4px 10px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.textMute,fontSize:10.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.02em"}}
              onMouseEnter={e=>{e.target.style.color=T.red;e.target.style.borderColor=T.redBd;e.target.style.background=T.redBg;}}
              onMouseLeave={e=>{e.target.style.color=T.textMute;e.target.style.borderColor=T.border;e.target.style.background="transparent";}}
            >Clear all bindings</button>
          )}
        </div>

        {selected.size>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 11px",borderRadius:5,background:T.orangeBg,border:`1px solid ${T.orangeBd}`,marginBottom:9}}>
            <span style={{fontSize:11,color:T.text,flex:1,fontWeight:600}}>{selected.size} selected</span>
            {selUnbound.length>0&&<button onClick={()=>setModal({type:"bind",zones:selUnbound})} style={batchBtnStyle(T.orange,T.orange,"#fff")}>Enable {selUnbound.length}</button>}
            {selBound.length>0&&<button onClick={()=>setModal({type:"unbind",zones:selBound})} style={batchBtnStyle(T.red,T.surface,T.red,T.redBd)}>Disable {selBound.length}</button>}
            <button onClick={()=>setSelected(new Set())} style={{background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:12,padding:0}}>✕</button>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,paddingLeft:2}}>
          <div onClick={toggleAll} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
            <div style={{width:13,height:13,borderRadius:2,border:`1px solid ${allSel?T.orange:T.borderHi}`,background:allSel?T.orange:T.surface,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
              {allSel&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}
            </div>
            <span style={{fontSize:10,color:T.textMute,fontWeight:600}}>Select all visible</span>
          </div>
          <span style={{fontSize:10,color:T.textFaint}}>{filtered.length} zone{filtered.length!==1?"s":""}</span>
        </div>

        {loading ? (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"18px 0",color:T.textMid,fontSize:12}}>
            <Spinner size={12} color={T.orange}/>Applying changes…
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {filtered.map(zone=>(
              <ZoneRow key={zone.id} zone={zone} selected={selected.has(zone.id)} workerInstalled={worker.installed}
                onToggle={()=>toggleSel(zone.id)}
                onBind={()=>setModal({type:"bind",zones:[zone]})}
                onUnbind={()=>setModal({type:"unbind",zones:[zone]})}
              />
            ))}
            {filtered.length===0&&<div style={{textAlign:"center",padding:"26px 0",color:T.textFaint,fontSize:12}}>No zones match.</div>}
          </div>
        )}
      </Section>
      <Modal cfg={modal} onConfirm={handleConfirm} onCancel={()=>setModal(null)}/>
    </React.Fragment>
  );
}

const batchBtnStyle = (color, bg, fg, bd) => ({padding:"4px 10px",borderRadius:4,border:`1px solid ${bd||color}`,background:bg||color,color:fg||"#fff",fontSize:10.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"});

function ZoneRow({ zone, selected, workerInstalled, onToggle, onBind, onUnbind }) {
  return (
    <div style={{
      background:selected?T.orangeBg:T.surface,
      border:`1px solid ${selected?T.orangeBd:T.border}`,
      borderRadius:5,padding:"8px 12px",
      display:"flex",alignItems:"center",gap:10,transition:"all 0.12s",
      position:"relative",overflow:"hidden",
    }}>
      {zone.bound&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:T.green,borderRadius:"5px 0 0 5px"}}/>}
      <div onClick={onToggle} style={{width:13,height:13,borderRadius:2,flexShrink:0,cursor:"pointer",border:`1px solid ${selected?T.orange:T.borderHi}`,background:selected?T.orange:T.surface,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
        {selected&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:zone.bound?4:0,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"'JetBrains Mono',monospace"}}>{zone.name}</span>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.06em",padding:"1px 6px",borderRadius:3,
            background:zone.bound?T.greenBg:T.panel,
            border:`1px solid ${zone.bound?T.greenBd:T.border}`,
            color:zone.bound?T.green:T.textMute,
            display:"inline-flex",alignItems:"center",gap:3}}>
            <span style={{width:4,height:4,borderRadius:"50%",background:zone.bound?T.green:T.textFaint}}/>
            {zone.bound?"PROTECTED":"UNPROTECTED"}
          </span>
          <IdChip id={zone.cfZoneId} label="zone"/>
        </div>
        {zone.bound&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            <StatPill label="since" value={fmtDate(zone.boundSince)}/>
            <StatPill label="sync" value={timeAgo(zone.lastSync)}/>
            <StatPill label="blocked" value={zone.blockedIPs.toLocaleString()+" IPs"} accent/>
          </div>
        )}
      </div>
      <div style={{flexShrink:0}}>
        {zone.bound
          ? <RowBtn label="Disable" color={T.red} onClick={onUnbind}/>
          : <RowBtn label="Enable" color={T.orange} onClick={onBind} disabled={!workerInstalled} title={!workerInstalled?"Install worker first":undefined}/>
        }
      </div>
    </div>
  );
}

function RowBtn({ label, color, onClick, disabled, title }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{padding:"3px 11px",borderRadius:4,border:`1px solid ${disabled?T.border:h?color:T.borderHi}`,background:h&&!disabled?`${color}10`:T.surface,color:disabled?T.textGhost:h?color:T.textMid,fontSize:10.5,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.12s",letterSpacing:"0.02em"}}
    >{label}</button>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle = { fontSize:9.5, fontWeight:700, color:T.textMute, letterSpacing:"0.08em", textTransform:"uppercase", whiteSpace:"nowrap" };
const inputStyle = { width:"100%", padding:"8px 11px", borderRadius:5, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box", transition:"border-color 0.15s" };

// ─── Tweaks defaults ──────────────────────────────────────────────────────────

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "compact",
  "accent": "#f6821f",
  "showInstallerStrip": true,
  "preInstalledState": true
}/*EDITMODE-END*/;

// ─── App root ─────────────────────────────────────────────────────────────────

function App() {
  const [t, setTweak] = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : [TWEAK_DEFAULTS, ()=>{}];

  // Apply accent live
  T.orange = t.accent;
  T.orangeBg = t.accent + "14";
  T.orangeBd = t.accent + "4d";

  const [cfValid, setCfValid]   = useState(false);
  const [csValid, setCsValid]   = useState(false);
  const [worker, setWorker]     = useState(t.preInstalledState ? MOCK_WORKER : {...MOCK_WORKER, installed:false, bouncer:null, sync:null, kvId:null, d1Id:null});
  const [zones, setZones]       = useState(t.preInstalledState ? MOCK_ZONES : MOCK_ZONES.map(z=>({...z,bound:false,lastSync:null,blockedIPs:0})));
  const [banner, setBanner]     = useState(null);

  const handleCfValid = useCallback(() => setCfValid(true), []);
  const handleCsValid = useCallback(() => setCsValid(true), []);

  const showBanner = useCallback((b) => { setBanner(b); setTimeout(()=>setBanner(null), 5000); }, []);

  const reset = () => {
    setCfValid(false); setCsValid(false);
    setWorker({...MOCK_WORKER, installed:false, bouncer:null, sync:null, kvId:null, d1Id:null});
    setZones(MOCK_ZONES.map(z=>({...z,bound:false,lastSync:null,blockedIPs:0})));
    setBanner(null);
  };

  const containerMaxW = t.density === "comfortable" ? 760 : 660;

  // ── Tweaks panel
  const TweaksPanel = window.TweaksPanel;
  const TweakSection = window.TweakSection;
  const TweakRadio = window.TweakRadio;
  const TweakColor = window.TweakColor;
  const TweakToggle = window.TweakToggle;
  const TweakButton = window.TweakButton;

  return (
    <React.Fragment>
      <div style={{minHeight:"100vh",background:T.bg}}>
        {/* Header */}
        <div style={{padding:"11px 22px",borderBottom:`1px solid ${T.border}`,background:T.surface,display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${t.accent},${T.orangeDk})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#fff",boxShadow:"0 1px 2px rgba(246,130,31,0.25)"}}>C</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:T.text,lineHeight:1.1,letterSpacing:"-0.01em"}}>CrowdSec</div>
            <div style={{fontSize:10,color:T.textMute,letterSpacing:"0.04em",marginTop:1}}>Cloudflare Worker Bouncer · installer</div>
          </div>
          <a href="https://doc.crowdsec.net/u/bouncers/cloudflare-workers/" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.textMute,textDecoration:"none",fontWeight:600,padding:"4px 9px",borderRadius:4,border:`1px solid ${T.border}`}}>Docs ↗</a>
        </div>

        <Banner banner={banner} onDismiss={()=>setBanner(null)}/>

        {/* Accordion */}
        <div style={{maxWidth:containerMaxW,margin:"24px auto",padding:"0 16px"}}>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(20,24,32,0.04)"}}>
            <CfTokenSection onValid={handleCfValid}/>
            <CrowdSecSection enabled={cfValid} onValid={handleCsValid}/>
            <WorkerSection enabled={cfValid} worker={worker} setWorker={setWorker} setZones={setZones} setBanner={showBanner}/>
            <ZonesSection enabled={cfValid} worker={worker} setWorker={setWorker} zones={zones} setZones={setZones} setBanner={showBanner}/>
          </div>
          <div style={{textAlign:"center",padding:"18px 0 32px",fontSize:10.5,color:T.textFaint}}>
            Token is used only in this session and never stored.
          </div>
        </div>
      </div>

      {/* Tweaks */}
      {TweaksPanel && (
        <TweaksPanel title="Tweaks">
          <TweakSection label="Layout">
            <TweakRadio label="Density" value={t.density} onChange={v=>setTweak('density', v)} options={["compact","comfortable"]}/>
          </TweakSection>
          <TweakSection label="Brand">
            <TweakColor label="Accent" value={t.accent} onChange={v=>setTweak('accent', v)} options={["#f6821f","#d96a0a","#2563eb","#1f9d6e"]}/>
          </TweakSection>
          <TweakSection label="Demo state">
            <TweakToggle label="Pre-installed" value={t.preInstalledState} onChange={v=>{ setTweak('preInstalledState', v); if(v){ setWorker(MOCK_WORKER); setZones(MOCK_ZONES);} else reset(); }}/>
            <TweakButton label="Reset prototype state" onClick={reset}/>
          </TweakSection>
        </TweaksPanel>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
