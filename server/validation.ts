import type { Finding, SpecData } from "./types.js";

export function validateSpec(data: Partial<SpecData>, blueprintText = ""): Finding[] {
  const out: Finding[] = [];
  const add = (code: string, severity: Finding["severity"], description: string, section: number | null = null, ref: string | null = null, source: Finding["source"] = "spec", fixApplied: string | null = null) =>
    out.push({ code, severity, description, section, ref, source, fixApplied });
  const course = data.course;
  if (!course?.code?.trim()) add("V1", "error", "Course code is missing.", 1);
  if (!course?.title?.trim()) add("V1", "error", "Course title is missing.", 1);
  if (!data.courseOutcomes?.length) add("V2", "error", "No course outcomes were found.", 2);
  const coIds = (data.courseOutcomes ?? []).map(c => c.id.trim().toUpperCase());
  if (new Set(coIds).size !== coIds.length) add("V3", "error", "Duplicate course outcome identifiers were found.", 2);
  (data.courseOutcomes ?? []).forEach(co => { if (!co.text.trim()) add("V2", "error", `${co.id} has an empty outcome statement.`, 2, co.id); });
  const credits = course?.credits;
  if (credits && [credits.lecture, credits.tutorial, credits.practical].some(n => !Number.isFinite(n) || n < 0))
    add("V4", "error", "Credit values must be non-negative numbers.", 1);
  const hours = (data.units ?? []).reduce((sum, u) => sum + (Number(u.hours) || 0), 0);
  if ((data.units ?? []).some(u => Number(u.hours) < 0)) add("V5", "error", "A unit has negative teaching hours.", 3);
  if (data.units?.length && hours === 0) add("V5", "warning", "Unit teaching hours total zero; confirm the hours.", 3);
  const weights = data.assessments ?? [];
  if (weights.length && Math.abs(weights.reduce((s, a) => s + (Number(a.weight) || 0), 0) - 100) > 0.01)
    add("V6", "error", `Assessment weights total ${weights.reduce((s, a) => s + (Number(a.weight) || 0), 0)}%, not 100%.`, 8);
  if (!weights.length) add("V6", "warning", "Assessment pattern is missing.", 8);
  if (blueprintText.trim() && data.courseOutcomes?.length) {
    const found = data.courseOutcomes.some(co => blueprintText.toLowerCase().includes(co.text.slice(0, Math.min(24, co.text.length)).toLowerCase()));
    if (!found) add("V7", "warning", "Blueprint text was provided but a matching CO statement was not confidently detected; verify blueprint priority.", 2, null, "blueprint");
  }
  if (!data.mapping?.length) add("V8", "warning", "CO–PO–PSO mapping has not been generated.", 9);
  if ((data.courseOutcomes ?? []).some(co => !co.bloomLevel || co.bloomLevel === "Unknown"))
    add("V9", "warning", "One or more Bloom levels could not be inferred confidently.", 2);
  if (!data.template) add("V10", "error", "No template selected.", 1);
  return out;
}

export function selectTemplate(practicalCredits: number, courseType: string): "integrated_lab" | "non_lab" {
  return practicalCredits > 0 || /laboratory|lab course|practical/i.test(courseType) ? "integrated_lab" : "non_lab";
}
