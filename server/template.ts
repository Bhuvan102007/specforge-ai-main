import fs from "node:fs";
import path from "node:path";
import type { SpecData } from "./types.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
export function renderTemplate(data: SpecData): string {
  const file = data.template === "integrated_lab" ? "integrated_lab.html" : "non_lab.html";
  let html = fs.readFileSync(path.resolve("templates", file), "utf8");
  const replace = (key: string, value: string) => { html = html.replaceAll(`{{${key}}}`, value); };
  replace("COURSE_CODE", esc(data.course.code)); replace("COURSE_TITLE", esc(data.course.title));
  replace("COURSE_TYPE", esc(data.course.type)); replace("CREDITS", `${data.course.credits.lecture}:${data.course.credits.tutorial}:${data.course.credits.practical}`);
  replace("SUMMARY", esc(data.course.summary)); replace("FACULTY", esc(data.course.faculty));
  replace("CO_ROWS", data.courseOutcomes.map(co => `<tr><td>${esc(co.id)}</td><td>${esc(co.text)}</td><td>${esc(co.bloomLevel)}</td></tr>`).join(""));
  replace("UNIT_ROWS", data.units.map(u => `<tr><td>${esc(u.title)}</td><td>${u.topics.map(esc).join("<br>")}</td><td>${esc(u.hours)}</td></tr>`).join(""));
  replace("ASSESSMENT_ROWS", data.assessments.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.weight)}</td></tr>`).join(""));
  const targets = [...new Set(data.mapping.map(m => m.target))];
  replace("MAPPING_HEADERS", targets.map(t => `<th>${esc(t)}</th>`).join(""));
  replace("MAPPING_ROWS", data.courseOutcomes.map(co => `<tr><td>${esc(co.id)}</td>${targets.map(t => { const m = data.mapping.find(x => x.co === co.id && x.target === t); return `<td>${m?.strength ?? ""}${m?.justification ? `<br><small>${esc(m.justification)}</small>` : ""}</td>`; }).join("")}</tr>`).join(""));
  return html;
}
export function unresolvedPlaceholders(html: string): string[] { return [...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m => m[1]); }
