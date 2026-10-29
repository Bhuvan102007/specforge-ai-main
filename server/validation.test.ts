import test from "node:test";
import assert from "node:assert/strict";
import { selectTemplate, validateSpec } from "./validation.js";

test("selects integrated lab for practical credits", () => assert.equal(selectTemplate(1, "Theory"), "integrated_lab"));
test("selects integrated lab for laboratory course type", () => assert.equal(selectTemplate(0, "Laboratory"), "integrated_lab"));
test("selects non-lab for theory with no practical credits", () => assert.equal(selectTemplate(0, "Theory"), "non_lab"));
test("flags assessment weights that do not total 100", () => {
  const findings = validateSpec({ course: { code: "X", title: "X", type: "Theory", credits: { lecture: 3, tutorial: 0, practical: 0 }, faculty: "", summary: "" }, courseOutcomes: [], units: [], assessments: [{ name: "Test", weight: 30 }], mapping: [], template: "non_lab" } as never);
  assert.ok(findings.some(f => f.code === "V6" && f.severity === "error"));
});
