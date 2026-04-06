import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { StepError, StepId } from "./types";

export function nowIso() {
  return new Date().toISOString();
}

export function sha256File(filePath: string) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function structuredError(
  stepId: StepId,
  message: string,
  category: string
): StepError {
  return { stepId, message, category };
}
