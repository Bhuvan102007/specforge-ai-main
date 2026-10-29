import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { DEFAULT_GEMINI_MODEL, generateWithGemini } from "./gemini.js";
import { selectTemplate, validateSpec } from "./validation.js";
import { renderTemplate, unresolvedPlaceholders } from "./template.js";
import type { SpecData } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 3001);
if (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL === "gemini-2.5-flash") process.env.GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(cors()); app.use(express.json({ limit: "2mb" }));

async function extract(file?: Express.Multer.File): Promise<string> {
  if (!file) return "";
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".docx") return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (ext === ".pdf") return (await pdfParse(file.buffer)).text;
  if (ext === ".txt" || ext === ".html") return file.buffer.toString("utf8").replace(/<[^>]*>/g, " ");
  throw new Error(`Unsupported file type: ${ext}. Upload DOCX, PDF, TXT, or HTML.`);
}
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "SpecForge AI", geminiConfigured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL }));
app.post("/api/config/gemini", (req, res) => {
  const origin = req.get("origin");
  let originHost = "";
  try { originHost = origin ? new URL(origin).hostname : ""; } catch { /* Invalid origins are rejected below. */ }
  const isLocalOrPrivateHost = (host: string) => {
    if (host === "localhost" || host === "::1") return true;
    const ipVersion = isIP(host);
    if (ipVersion === 4) {
      const octets = host.split(".").map(Number);
      return octets[0] === 10
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168)
        || (octets[0] === 169 && octets[1] === 254);
    }
    return ipVersion === 6 && (/^(fc|fd)/i.test(host) || /^fe[89ab]/i.test(host));
  };
  if (!originHost || originHost !== req.hostname || !isLocalOrPrivateHost(originHost)) {
    return res.status(403).json({ error: "Gemini settings can only be updated from the local app." });
  }
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
  if ((!apiKey && !model) || (apiKey && /[\r\n]/.test(apiKey)) || (model && !/^[A-Za-z0-9._-]+$/.test(model))) {
    return res.status(400).json({ error: "Enter a valid Gemini API key or model name." });
  }
  const envPath = path.resolve(".env");
  const envLines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const setEnvValue = (name: string, value: string) => {
    const index = envLines.findIndex(line => new RegExp(`^\\s*${name}\\s*=`).test(line));
    const line = `${name}=${value}`;
    if (index >= 0) envLines[index] = line;
    else envLines.push(line);
  };
  if (apiKey) {
    setEnvValue("GEMINI_API_KEY", apiKey);
    process.env.GEMINI_API_KEY = apiKey;
  }
  if (model) {
    setEnvValue("GEMINI_MODEL", model);
    process.env.GEMINI_MODEL = model;
  }
  fs.writeFileSync(envPath, `${envLines.filter((line, index) => index < envLines.length - 1 || line !== "").join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL });
});
app.post("/api/gemini/test", async (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(400).json({ ok: false, error: "GEMINI_API_KEY is missing from the server .env file." });
  try {
    const data = await generateWithGemini("Return the requested JSON. Course code: DEMO-101; title: Demo Course; type: Theory; credits L:T:P 3:0:0.", "");
    res.json({ ok: true, message: `Gemini responded successfully using ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}.` , sampleTitle: data.course.title });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gemini request failed.";
    const status = /temporarily busy/i.test(message) ? 503 : /did not respond within/i.test(message) ? 504 : 502;
    res.status(status).json({ ok: false, error: message });
  }
});
app.post("/api/parse", upload.fields([{ name: "spec", maxCount: 1 }, { name: "blueprint", maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const specText = await extract(files?.spec?.[0]); const blueprintText = await extract(files?.blueprint?.[0]);
    if (!specText.trim()) return res.status(400).json({ error: "Upload a course specification file first." });
    res.json({ specText, blueprintText, specChars: specText.length, blueprintChars: blueprintText.length });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Document parsing failed." }); }
});
app.post("/api/generate", async (req, res) => {
  try {
    const { specText = "", blueprintText = "", manualTemplate, overrideReason } = req.body as { specText: string; blueprintText?: string; manualTemplate?: string; overrideReason?: string };
    if (!specText.trim()) return res.status(400).json({ error: "Parse a specification before generating." });
    if (manualTemplate && !overrideReason?.trim()) return res.status(400).json({ error: "A reason is required for manual template override." });
    const data = await generateWithGemini(specText, blueprintText || "");
    const recommended = selectTemplate(data.course.credits.practical, data.course.type);
    data.template = (manualTemplate === "integrated_lab" || manualTemplate === "non_lab" ? manualTemplate : recommended);
    data.validation = [...(data.validation || []), ...validateSpec(data, blueprintText || "")];
    if (manualTemplate) data.validation.push({ code: "T-OVERRIDE", severity: "info", source: "template", section: 1, ref: null, description: `Template manually overridden: ${overrideReason}`, fixApplied: data.template });
    const html = renderTemplate(data);
    const unresolved = unresolvedPlaceholders(html);
    if (unresolved.length) data.validation.push({ code: "T-PLACEHOLDER", severity: "error", source: "template", section: null, ref: null, description: `Unresolved placeholders: ${unresolved.join(", ")}`, fixApplied: null });
    res.json({ data, html, unresolvedPlaceholders: unresolved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    const status = /API key|GEMINI_API_KEY|not configured/i.test(message) ? 400
      : /temporarily busy/i.test(message) ? 503
      : /did not respond within/i.test(message) ? 504
      : 502;
    res.status(status).json({ error: message });
  }
});
app.post("/api/workflow", (req, res) => {
  const { role, action, status, comment } = req.body as { role: string; action: string; status: string; comment?: string };
  const transitions: Record<string, { role: string; next: string }[]> = {
    submit: [{ role: "Author", next: "Submitted" }],
    return: [{ role: "Reviewer", next: "Returned" }, { role: "HOD", next: "Returned" }],
    forward: [{ role: "Reviewer", next: "Forwarded" }],
    approve: [{ role: "HOD", next: "Approved" }]
  };
  const allowed = transitions[action]?.some(t => t.role === role);
  if (!allowed) return res.status(403).json({ error: `Role ${role} cannot perform ${action}.` });
  if ((action === "return" || action === "approve") && !comment?.trim()) return res.status(400).json({ error: "A comment is required for return/approval actions." });
  res.json({ ok: true, status: transitions[action].find(t => t.role === role)!.next, history: { role, action, comment: comment || "", at: new Date().toISOString(), previousStatus: status } });
});
app.get("/api/config/po-pso", (_req, res) => res.sendFile(path.resolve("config/po_pso.json")));
app.get("/api/demo", (_req, res) => {
  const demo: SpecData = {
    course: { code: "CSE204", title: "Data Structures and Algorithms", type: "Theory", credits: { lecture: 3, tutorial: 1, practical: 0 }, faculty: "Department of Computer Science", summary: "Study of fundamental data structures, algorithm design, and complexity analysis." },
    courseOutcomes: [
      { id: "CO-1", text: "Explain linear and non-linear data structures.", bloomLevel: "Understand" },
      { id: "CO-2", text: "Apply searching and sorting algorithms to solve computational problems.", bloomLevel: "Apply" },
      { id: "CO-3", text: "Analyze algorithm complexity using asymptotic notation.", bloomLevel: "Analyze" }
    ],
    units: [
      { title: "Unit I — Foundations", hours: 9, topics: ["Abstract data types", "Complexity analysis", "Arrays and linked lists"] },
      { title: "Unit II — Linear structures", hours: 9, topics: ["Stacks", "Queues", "Applications"] },
      { title: "Unit III — Trees and graphs", hours: 10, topics: ["Binary trees", "Traversals", "Graph representation"] }
    ],
    assessments: [{ name: "Internal assessment", weight: 40 }, { name: "End-semester examination", weight: 60 }],
    mapping: [
      { co: "CO-1", target: "PO1", strength: 3, justification: "Explaining data structures uses foundational computing knowledge." },
      { co: "CO-2", target: "PO2", strength: 3, justification: "Applying algorithms requires analysis of problem requirements." },
      { co: "CO-2", target: "PO5", strength: 2, justification: "Algorithm implementation uses computational tools." },
      { co: "CO-3", target: "PO2", strength: 3, justification: "Complexity analysis evaluates algorithm behaviour and efficiency." }
    ],
    template: "non_lab", validation: [], generatedAt: new Date().toISOString(), approvalStatus: "Draft"
  };
  demo.validation = validateSpec(demo);
  const html = renderTemplate(demo);
  res.json({ data: demo, html });
});
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected server error." });
});
app.listen(port, () => console.log(`SpecForge API listening on http://localhost:${port}`));
