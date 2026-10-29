import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SpecData } from "./types.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

const fallback = (): SpecData => ({
  course: { code: "", title: "", type: "Theory", credits: { lecture: 3, tutorial: 0, practical: 0 }, faculty: "", summary: "" },
  courseOutcomes: [], units: [], assessments: [], mapping: [], template: "non_lab", validation: [],
  generatedAt: new Date().toISOString(), approvalStatus: "Draft"
});

export async function generateWithGemini(specText: string, blueprintText: string, modelName = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL): Promise<SpecData> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured. Add GEMINI_API_KEY to your .env file.");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json", temperature: 0.15 } });
  const prompt = `You are SpecForge AI, an academic course specification assistant. Extract and normalize the course specification from the supplied documents. Never invent missing academic facts: use empty strings, empty arrays, or null-equivalent defaults and flag missing details in validation. If a blueprint is present, prioritize its CO statements and unit-wise syllabus. Use the source specification for other fields. Create a new CO-PO-PSO mapping with strengths 3,2,1 or null and one concise justification per populated cell. Use common Bloom taxonomy levels based on the main verb. Return ONLY JSON matching this shape:
${JSON.stringify(fallback())}
Rules: course.credits is {lecture:number,tutorial:number,practical:number}; courseOutcomes is [{id:"CO-1",text:string,bloomLevel:string}]; units is [{title:string,hours:number,topics:string[]}]; assessments is [{name:string,weight:number}]; mapping is [{co:string,target:"PO1"|"PO2"|"PO3"|"PO4"|"PO5"|"PO6"|"PO7"|"PO8"|"PO9"|"PO10"|"PO11"|"PO12"|"PSO1"|"PSO2",strength:3|2|1|null,justification:string}]; template is integrated_lab or non_lab; validation is an array of findings. Use source text as evidence; do not copy any existing mapping blindly. Keep output concise but complete.
SOURCE SPECIFICATION:
${specText.slice(0, 45000)}
BLUEPRINT (takes priority for COs and unit syllabus when present):
${blueprintText.slice(0, 30000) || "(not provided)"}`;
  let result: Awaited<ReturnType<typeof model.generateContent>> | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      result = await model.generateContent(
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { signal: controller.signal }
      );
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini request failed.";
      const timedOut = controller.signal.aborted;
      const transient = /\[(?:429|500|502|503|504)(?:\s|])/i.test(message);
      if ((!transient && !timedOut) || attempt >= 2) {
        if (timedOut) throw new Error("Gemini did not respond within 15 seconds. Please retry or select another model in Settings.");
        if (transient) throw new Error(`Gemini is temporarily busy (HTTP ${message.match(/\[(\d{3})/)?.[1] || "5xx"}). Please retry shortly.`);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    } finally { clearTimeout(timeout); }
  }
  if (!result) {
    throw new Error("Gemini request failed without returning a result. Please retry.");
  }
  const text = result.response.text().trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  if (!text) throw new Error("Gemini returned an empty response. Please retry.");
  const parsed = JSON.parse(text) as SpecData;
  if (!parsed.course) throw new Error("Gemini returned JSON without a course object.");
  parsed.courseOutcomes ??= []; parsed.units ??= []; parsed.assessments ??= []; parsed.mapping ??= []; parsed.validation ??= [];
  parsed.generatedAt = new Date().toISOString();
  parsed.approvalStatus = "Draft";
  return parsed;
}
