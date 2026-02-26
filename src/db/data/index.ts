// Data access layer — barrel export
// All database operations go through these modules.
// Consumers should never import db, schema, or drizzle-orm directly.

export * from "./tickets";
export * from "./comments";
// documents.ts removed — use attachments with tags (research-doc, implementation-plan, design-doc)
export * from "./projects";
export * from "./personas";
export * from "./roles";
export * from "./notes";
export * from "./settings";
export * from "./audit";
export * from "./attachments";
export * from "./workers";
export * from "./agent-runs";
