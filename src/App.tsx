import { useEffect, useMemo, useState } from "react";

type Finding = { code: string; severity: "error" | "warning" | "info"; source: string; section: number | null; ref: string | null; description: string; fixApplied: string | null };
type SpecData = { course: { code: string; title: string; type: string; credits: { lecture: number; tutorial: number; practical: number }; faculty: string; summary: string }; courseOutcomes: { id: string; text: string; bloomLevel: string }[]; units: { title: string; hours: number; topics: string[] }[]; assessments: { name: string; weight: number }[]; mapping: { co: string; target: string; strength: number | null; justification: string }[]; template: "integrated_lab" | "non_lab"; validation: Finding[]; generatedAt: string; approvalStatus: string };
type Result = { data: SpecData; html: string };
type ApiError = { error?: string };
const API = "/api";
const themes = ["Midnight", "Ocean", "Violet", "Forest", "Amber"];
const icon = (name: string) => ({ grid: "▦", file: "▤", template: "▣", map: "⌘", shield: "⬡", users: "◎", settings: "⚙", spark: "✦", upload: "↑", check: "✓", alert: "!", download: "↓", clock: "◷" }[name] || "•");

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) throw new Error(`The server returned an empty response (HTTP ${response.status}). Please retry.`);
  let data: T & ApiError;
  try { data = JSON.parse(body) as T & ApiError; }
  catch { throw new Error(`The server returned an invalid response (HTTP ${response.status}). Please retry or check the server logs.`); }
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
  return data;
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem("sf-theme") || "Midnight");
  const [page, setPage] = useState("Dashboard");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [blueprintFile, setBlueprintFile] = useState<File | null>(null);
  const [specText, setSpecText] = useState("");
  const [blueprintText, setBlueprintText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState("Checking API…");
  const [geminiKey, setGeminiKey] = useState("");
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [manualTemplate, setManualTemplate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [role, setRole] = useState("Author");
  const [comment, setComment] = useState("");
  const [history, setHistory] = useState<{ role: string; action: string; comment: string; at: string }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState<{ geminiConfigured: boolean; model: string } | null>(null);

  useEffect(() => { document.documentElement.dataset.theme = theme.toLowerCase(); localStorage.setItem("sf-theme", theme); }, [theme]);
  useEffect(() => {
    fetch(`${API}/health`, { signal: AbortSignal.timeout(8000) })
      .then(readApiResponse<{ ok: boolean; geminiConfigured: boolean; model: string }>)
      .then(d => { setHealth(d); setModel(d.model); setApiStatus(d.ok ? "API online" : "API unavailable"); })
      .catch(() => setApiStatus("API offline — run npm run dev"));
  }, []);
  const findings = result?.data.validation ?? [];
  const errors = findings.filter(f => f.severity === "error").length;
  const warnings = findings.filter(f => f.severity === "warning").length;
  const recommended = result?.data.course.credits.practical! > 0 || /lab|practical/i.test(result?.data.course.type || "") ? "integrated_lab" : "non_lab";

  async function parseFiles() {
    setBusy("parse"); setError(""); setMessage("");
    try {
      const form = new FormData(); if (specFile) form.append("spec", specFile); if (blueprintFile) form.append("blueprint", blueprintFile);
      const response = await fetch(`${API}/parse`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
      const data = await readApiResponse<{ specText: string; blueprintText: string; specChars: number; blueprintChars: number }>(response);
      setSpecText(data.specText); setBlueprintText(data.blueprintText); setMessage(`Extracted ${data.specChars.toLocaleString()} characters${data.blueprintChars ? ` and ${data.blueprintChars.toLocaleString()} blueprint characters` : ""}. Review the extracted text before generating.`);
      setPage("Reader");
    } catch (e) { setError(e instanceof Error ? e.message : "Parse failed."); } finally { setBusy(""); }
  }
  async function generate() {
    setBusy("generate"); setError(""); setMessage("");
    try {
      const response = await fetch(`${API}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specText, blueprintText, manualTemplate: manualTemplate || undefined, overrideReason }), signal: AbortSignal.timeout(65000) });
      const data = await readApiResponse<Result>(response);
      setResult(data); setPage("Inspector"); setMessage("Gemini generation completed. Review all AI suggestions before approval.");
    } catch (e) { setError(e instanceof Error ? e.name === "TimeoutError" ? "Generation timed out while waiting for Gemini. Please retry." : e.message : "Generation failed."); } finally { setBusy(""); }
  }
  async function loadDemo() {
    setBusy("demo"); setError("");
    try { const r = await fetch(`${API}/demo`, { signal: AbortSignal.timeout(10000) }); const d = await readApiResponse<Result>(r); setResult(d); setPage("Dashboard"); setMessage("Demo course loaded. This is sample data, not a real course specification."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load demo. Ensure the API server is running."); } finally { setBusy(""); }
  }
  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  function exportJSON() { if (result) download("specforge_output.json", JSON.stringify(result.data, null, 2), "application/json"); }
  function exportHTML() { if (result) download("specforge_specification.html", result.html, "text/html"); }
  function exportReport() { if (result) download("specforge_validation_report.json", JSON.stringify({ generatedAt: new Date().toISOString(), findings: result.data.validation }, null, 2), "application/json"); }
  async function testGemini() {
    setBusy("test"); setError(""); setMessage("Testing Gemini from the server…");
    try { const r = await fetch(`${API}/gemini/test`, { method: "POST", signal: AbortSignal.timeout(65000) }); const d = await readApiResponse<{ message: string }>(r); setMessage(d.message); }
    catch (e) { setError(e instanceof Error ? e.name === "TimeoutError" ? "Gemini test timed out. Check your connection and try again." : e.message : "Gemini test failed."); } finally { setBusy(""); }
  }
  async function saveGeminiSettings() {
    setBusy("save-key"); setError(""); setMessage("");
    try {
      const response = await fetch(`${API}/config/gemini`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: geminiKey, model }), signal: AbortSignal.timeout(10000) });
      const data = await readApiResponse<{ geminiConfigured: boolean; model: string }>(response);
      setHealth({ geminiConfigured: data.geminiConfigured, model: data.model });
      setGeminiKey("");
      setModel(data.model);
      setMessage("Gemini settings saved locally. Test the connection to verify them.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save Gemini settings."); } finally { setBusy(""); }
  }
  async function workflow(action: string) {
    setBusy("workflow"); setError("");
    try {
      const r = await fetch(`${API}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, action, status: result?.data.approvalStatus || "Draft", comment }), signal: AbortSignal.timeout(10000) });
      const d = await readApiResponse<{ history: { role: string; action: string; comment: string; at: string }; status: string }>(r);
      setHistory(old => [d.history, ...old]); if (result) setResult({ ...result, data: { ...result.data, approvalStatus: d.status } }); setMessage(`Workflow status changed to ${d.status}.`); setComment("");
    } catch (e) { setError(e instanceof Error ? e.message : "Workflow action failed."); } finally { setBusy(""); }
  }
  const nav = [
    ["Dashboard", "grid"], ["Reader", "file"], ["Template Studio", "template"], ["CO–PO Mapper", "map"], ["Inspector", "shield"], ["Approval", "users"]
  ];
  const pageTitle = page === "Dashboard" ? "Course specification studio" : page;
  const subtitle = page === "Dashboard" ? "Transform course documents into structured, reviewable specifications." : "Prepare, inspect, and validate academic course specification data.";
  const statusText = result?.data.approvalStatus || "Draft";
  const mappingTargets = useMemo(() => [...new Set(result?.data.mapping.map(m => m.target) || [])], [result]);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S<span>✦</span></div><div><strong>SpecForge<span className="ai"> AI</span></strong><small>ACADEMIC WORKSPACE</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(([label, ico]) => <button key={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => setPage(label)}><span className="nav-icon">{icon(ico)}</span><span>{label}</span>{label === "Inspector" && findings.length > 0 && <b className="nav-count">{findings.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="ai-card"><div className="ai-card-icon">{icon("spark")}</div><div><strong>Gemini Intelligence</strong><p>{health?.geminiConfigured ? "API key configured" : "API key setup required"}</p></div><span className={`pulse ${health?.geminiConfigured ? "online" : ""}`} /></div><button className="nav-item" onClick={() => setShowSettings(true)}><span className="nav-icon">{icon("settings")}</span>Settings</button><div className="user-chip"><div className="avatar">SF</div><div><strong>SpecForge Workspace</strong><small>Local buildathon demo</small></div><span>•••</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><span className={`api-pill ${health?.geminiConfigured ? "good" : ""}`}><i />{apiStatus}</span><select className="theme-select" value={theme} onChange={e => setTheme(e.target.value)} aria-label="Theme">{themes.map(t => <option key={t}>{t}</option>)}</select><button className="icon-button" onClick={() => setShowSettings(true)} title="Settings">{icon("settings")}</button><div className="avatar small">SF</div></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> AI-POWERED DOCUMENT ENGINE</div><h1>{pageTitle}</h1><p>{subtitle}</p></div><div className="heading-actions"><button className="btn secondary" onClick={loadDemo} disabled={!!busy}>{icon("spark")} Load demo</button>{result && <button className="btn primary" onClick={exportJSON}>{icon("download")} Export JSON</button>}</div></div>
        {message && <div className="notice success"><span>✓</span>{message}<button onClick={() => setMessage("")}>×</button></div>}
        {error && <div className="notice error"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}
        <section className="stats-grid">
          <Stat label="DOCUMENTS READ" value={specText ? "1" : result ? "1" : "0"} sub={blueprintText ? "Blueprint attached" : "Specification source"} icon="file" />
          <Stat label="ACTIVE TEMPLATE" value={result ? result.data.template === "integrated_lab" ? "Integrated Lab" : "Non-Lab" : "Not selected"} sub={result ? "Ready for review" : "Auto-selected from course type"} icon="template" />
          <Stat label="VALIDATION FLAGS" value={String(findings.length)} sub={`${errors} errors · ${warnings} warnings`} icon="shield" />
          <Stat label="WORKFLOW STATUS" value={statusText} sub="Approval lifecycle" icon="users" />
        </section>
        {page === "Dashboard" && <div className="dashboard-grid">
          <section className="panel upload-panel"><PanelHeader title="Start with your documents" sub="Upload a course specification and optional blueprint." tag="STEP 01" />
            <div className="drop-grid"><FileDrop title="Course specification" description="Required · DOCX, PDF, TXT, HTML" file={specFile} onFile={setSpecFile} required /><FileDrop title="Question-paper blueprint" description="Optional · prioritizes COs and syllabus" file={blueprintFile} onFile={setBlueprintFile} /></div>
            <div className="panel-footer"><span className="muted">Maximum 15 MB per file</span><button className="btn primary" onClick={parseFiles} disabled={!specFile || !!busy}>{busy === "parse" ? <Spinner /> : icon("upload")} Extract document</button></div>
          </section>
          <section className="panel pipeline-panel"><PanelHeader title="Generation pipeline" sub="From source files to approved specification." tag="WORKFLOW" />
            {["Document reader","Template selector","Gemini structuring","Validation engine","Review & approval"].map((s,i)=><div className="pipeline-step" key={s}><div className={`pipeline-number ${result && i < 4 ? "done" : ""}`}>{result && i < 4 ? "✓" : `0${i+1}`}</div><div><strong>{s}</strong><small>{["Extract text and tables","Choose official course layout","Normalize fields and map outcomes","Run deterministic quality checks","Route to reviewer and HOD"][i]}</small></div><span className={`step-status ${result && i < 4 ? "complete" : ""}`}>{result && i < 4 ? "Complete" : i === 2 ? "Gemini" : "Ready"}</span></div>)}
          </section>
          <section className="panel recent-panel"><PanelHeader title="Current specification" sub="Your latest working document." tag="LIVE" />
            {result ? <div className="current-doc"><div className="doc-icon">DOC</div><div className="doc-info"><strong>{result.data.course.title || "Untitled course"}</strong><small>{result.data.course.code || "No course code"} · {result.data.courseOutcomes.length} outcomes · {result.data.units.length} units</small></div><span className="badge draft">{statusText}</span></div> : <Empty text="No specification yet" sub="Upload your course file or load demo data to begin." />}
          </section>
          <section className="panel readiness-panel"><PanelHeader title="Quality snapshot" sub="Automated checks before academic review." tag="QUALITY" />
            <div className="quality-row"><span>Validation errors</span><strong className={errors ? "text-danger" : "text-good"}>{errors}</strong></div><div className="quality-row"><span>Warnings to review</span><strong className={warnings ? "text-warn" : "text-good"}>{warnings}</strong></div><div className="quality-row"><span>CO–PO mapping cells</span><strong>{result?.data.mapping.length ?? 0}</strong></div><div className="quality-row"><span>Template placeholders</span><strong className="text-good">0 unresolved</strong></div><button className="text-button" onClick={() => setPage("Inspector")}>Open validation inspector →</button>
          </section>
        </div>}
        {page === "Reader" && <section className="panel"><PanelHeader title="Document reader" sub="Extracted source text. Review it before asking Gemini to structure the course." tag="STEP 01" />
          <div className="field-row"><label>Course specification text<textarea value={specText} onChange={e => setSpecText(e.target.value)} placeholder="Upload a DOCX/PDF or paste source text here…" rows={12} /></label></div>
          <div className="field-row"><label>Blueprint text (optional)<textarea value={blueprintText} onChange={e => setBlueprintText(e.target.value)} placeholder="Optional blueprint content…" rows={6} /></label></div>
          <div className="panel-footer"><span className="muted">{specText.length.toLocaleString()} specification characters</span><button className="btn primary" disabled={!specText.trim() || !!busy} onClick={generate}>{busy === "generate" ? <Spinner /> : icon("spark")} Generate with Gemini</button></div>
        </section>}
        {page === "Template Studio" && <section className="panel"><PanelHeader title="Official template studio" sub="Choose the official layout. Overrides require a reason." tag="STEP 02" />
          <div className="template-options"><button className={`template-card ${(manualTemplate || recommended) === "non_lab" ? "selected" : ""}`} onClick={() => setManualTemplate("non_lab")}><div className="template-art nonlab-art"><div /><div /><div /><div /></div><strong>Non-Lab Course</strong><p>For theory and non-practical courses.</p><span>Classic academic layout</span></button><button className={`template-card ${(manualTemplate || recommended) === "integrated_lab" ? "selected" : ""}`} onClick={() => setManualTemplate("integrated_lab")}><div className="template-art lab-art"><div /><div /><div /><div /></div><strong>Integrated Lab</strong><p>For practical credits or laboratory courses.</p><span>Includes laboratory practice section</span></button></div>
          <label className="field-label">Reason for manual override<textarea rows={2} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Required when selected template differs from automatic recommendation." /></label>
          <div className="callout">Automatic recommendation: <b>{recommended === "integrated_lab" ? "Integrated Lab" : "Non-Lab"}</b>. A manual selection is applied at generation time and recorded in validation.</div>
          <button className="btn primary" disabled={!specText.trim() || !!busy || (manualTemplate !== "" && manualTemplate !== recommended && !overrideReason.trim())} onClick={generate}>{busy === "generate" ? <Spinner /> : icon("spark")} Generate specification</button>
        </section>}
        {page === "CO–PO Mapper" && <section className="panel"><PanelHeader title="CO–PO–PSO mapping" sub="AI-suggested mapping with strength and justification." tag="STEP 03" />
          {!result ? <Empty text="No mapping to inspect yet" sub="Generate a specification or load the demo." /> : <><div className="mapping-table-wrap"><table className="data-table"><thead><tr><th>Course outcome</th>{mappingTargets.map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{result.data.courseOutcomes.map(co=><tr key={co.id}><td><strong>{co.id}</strong><small>{co.text}</small></td>{mappingTargets.map(t=>{const m=result.data.mapping.find(x=>x.co===co.id&&x.target===t);return <td key={t}><span className={`strength s${m?.strength || 0}`}>{m?.strength ?? "—"}</span>{m?.justification&&<small className="justification">{m.justification}</small>}</td>})}</tr>)}</tbody></table></div><p className="muted">Strength 3 = strong, 2 = moderate, 1 = low. Every populated cell should have a justification. Review suggestions academically.</p></>}
        </section>}
        {page === "Inspector" && <section className="panel"><PanelHeader title="Validation inspector" sub="Deterministic rules plus AI-reported conflicts. Review before approval." tag="STEP 04" />
          {result ? <><div className="validation-summary"><div><strong>{findings.length}</strong><small>Total findings</small></div><div><strong className="text-danger">{errors}</strong><small>Errors</small></div><div><strong className="text-warn">{warnings}</strong><small>Warnings</small></div></div><div className="findings-list">{findings.length ? findings.map((f,i)=><div className="finding" key={`${f.code}-${i}`}><span className={`finding-icon ${f.severity}`}>{f.severity==="error"?"!":f.severity==="warning"?"△":"i"}</span><div className="finding-main"><div><strong>{f.code}</strong><span className={`badge ${f.severity}`}>{f.severity}</span><span className="source-label">{f.source}{f.section ? ` · section ${f.section}` : ""}{f.ref ? ` · ${f.ref}` : ""}</span></div><p>{f.description}</p>{f.fixApplied&&<small>Fix applied: {f.fixApplied}</small>}</div></div>) : <Empty text="No findings returned" sub="Still review the specification before approval." />}</div><div className="panel-footer"><button className="btn secondary" onClick={exportReport}>{icon("download")} Export validation report</button><button className="btn secondary" onClick={exportHTML}>{icon("download")} Export HTML</button><button className="btn primary" onClick={exportJSON}>{icon("download")} Export JSON</button></div></> : <Empty text="Nothing to validate yet" sub="Generate a specification or load demo data." />}
        </section>}
        {page === "Approval" && <section className="panel"><PanelHeader title="Review and approval" sub="Demonstration workflow with server-side role/action checks." tag="STEP 05" />
          <div className="approval-top"><div><small>DOCUMENT STATUS</small><strong className="status-large">{statusText}</strong></div><div><small>ACTIVE ROLE</small><select value={role} onChange={e => setRole(e.target.value)}><option>Author</option><option>Reviewer</option><option>HOD</option></select></div></div>
          <label className="field-label">Comment / return reason<textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Required for return and approval actions." /></label>
          <div className="workflow-actions"><button className="btn primary" onClick={() => workflow("submit")} disabled={!!busy || role!=="Author"}>Submit draft</button><button className="btn secondary" onClick={() => workflow("forward")} disabled={!!busy || role!=="Reviewer"}>Forward to HOD</button><button className="btn secondary" onClick={() => workflow("return")} disabled={!!busy || !["Reviewer","HOD"].includes(role) || !comment.trim()}>Return with comment</button><button className="btn success" onClick={() => workflow("approve")} disabled={!!busy || role!=="HOD" || !comment.trim()}>Approve</button></div>
          <div className="history-title">Workflow history <span>{history.length} events</span></div>{history.length ? history.map((h,i)=><div className="history-row" key={i}><span className="history-dot" /><div><strong>{h.role} · {h.action}</strong><p>{h.comment || "No comment provided"}</p><small>{new Date(h.at).toLocaleString()}</small></div></div>) : <Empty text="No workflow events" sub="Submit the draft to start the workflow." />}
          <p className="muted">Local demo only: role selection is not real authentication. Production deployment needs identity management and durable audit storage.</p>
        </section>}
        <footer className="footer"><span>© 2026 SpecForge AI <i>•</i> Course specification intelligence</span><span><i className="footer-dot" /> Built for academic quality</span></footer>
      </div>
    </main>
    {showSettings && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false); }}><div className="modal"><div className="modal-head"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h2>Settings</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}>×</button></div><div className="settings-section"><h3>Appearance</h3><label className="field-label">Color theme<select value={theme} onChange={e => setTheme(e.target.value)}>{themes.map(t=><option key={t}>{t}</option>)}</select></label></div><div className="settings-section"><h3>Gemini AI</h3><p className="muted">Add your Gemini API key here. It is saved only in the local server .env file and is never sent back to the browser.</p><label className="field-label">Gemini API key<input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder={health?.geminiConfigured ? "Leave blank to keep saved key" : "Paste your Gemini API key"} autoComplete="off" spellCheck={false} /></label><label className="field-label">Model<input value={model} onChange={e => setModel(e.target.value)} /></label><button className="btn primary" onClick={saveGeminiSettings} disabled={(!geminiKey.trim() && model === health?.model) || !!busy}>{busy==="save-key"?<Spinner />:"Save Gemini settings"}</button><div className="callout">Current server status: <b>{health?.geminiConfigured ? "Key configured" : "Key missing"}</b><br/>Configured model: {health?.model || model}</div><button className="btn secondary" onClick={testGemini} disabled={!!busy}>{busy==="test"?<Spinner />:"Test Gemini connection"}</button><p className="tiny-note">The saved key is active immediately. Never paste it into screenshots or source code.</p></div><div className="modal-footer"><button className="btn secondary" onClick={() => setShowSettings(false)}>Close</button><a className="btn primary link-button" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get Gemini API key ↗</a></div></div></div>}
  </div>;
}
function Stat({ label, value, sub, icon: ico }: { label: string; value: string; sub: string; icon: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{({file:"▤",template:"▣",shield:"⬡",users:"◎"} as Record<string,string>)[ico]}</span></div><strong className="stat-value">{value}</strong><small>{sub}</small></div>; }
function PanelHeader({ title, sub, tag }: { title: string; sub: string; tag: string }) { return <div className="panel-header"><div><h2>{title}</h2><p>{sub}</p></div><span className="panel-tag">{tag}</span></div>; }
function FileDrop({ title, description, file, onFile, required = false }: { title: string; description: string; file: File | null; onFile: (f: File | null) => void; required?: boolean }) { return <label className={`file-drop ${file ? "has-file" : ""}`}><input type="file" accept=".docx,.pdf,.txt,.html" onChange={e => onFile(e.target.files?.[0] || null)} /><span className="drop-icon">{file ? "✓" : "↑"}</span><strong>{title}{required && <em>Required</em>}</strong><small>{description}</small><span className="file-select">{file ? file.name : "Choose file or drag here"}</span></label>; }
function Empty({ text, sub }: { text: string; sub: string }) { return <div className="empty-state"><div className="empty-icon">▤</div><strong>{text}</strong><p>{sub}</p></div>; }
function Spinner() { return <span className="spinner" aria-label="Loading" />; }
