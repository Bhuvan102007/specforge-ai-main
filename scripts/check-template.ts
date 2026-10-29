import assert from "node:assert/strict";
import { selectTemplate } from "../server/validation.js";
assert.equal(selectTemplate(1, "Theory"), "integrated_lab");
assert.equal(selectTemplate(0, "Laboratory"), "integrated_lab");
assert.equal(selectTemplate(0, "Theory"), "non_lab");
console.log("Template selection checks passed.");
