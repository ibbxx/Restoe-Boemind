import type { ZodError } from "zod";

/** Convert Zod's array-valued field errors to the action contract. */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fields[field]) fields[field] = issue.message;
  }
  return fields;
}
