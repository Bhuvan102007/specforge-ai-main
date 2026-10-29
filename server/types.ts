export type CourseOutcome = { id: string; text: string; bloomLevel: string };
export type Unit = { title: string; hours: number; topics: string[] };
export type Assessment = { name: string; weight: number };
export type MappingCell = { co: string; target: string; strength: number | null; justification: string };
export type Finding = { code: string; severity: "error" | "warning" | "info"; source: "spec" | "blueprint" | "template" | "system"; section: number | null; ref: string | null; description: string; fixApplied: string | null };
export type SpecData = {
  course: { code: string; title: string; type: string; credits: { lecture: number; tutorial: number; practical: number }; faculty: string; summary: string };
  courseOutcomes: CourseOutcome[];
  units: Unit[];
  assessments: Assessment[];
  mapping: MappingCell[];
  template: "integrated_lab" | "non_lab";
  validation: Finding[];
  generatedAt: string;
  approvalStatus: "Draft" | "Submitted" | "Returned" | "Approved";
};
