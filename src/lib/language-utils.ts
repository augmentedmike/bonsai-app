/**
 * Shared language instruction builder for agent prompts.
 *
 * Used by both the dispatch route and heartbeat dispatcher
 * to inject language instructions into agent system prompts.
 */

export function buildLanguageInstruction(userLanguage: string | null): string {
  if (userLanguage !== "es") return "";

  return [
    "",
    "## Language",
    "The user has set their preferred language to Spanish.",
    "You MUST write all responses, progress reports, research documents, implementation plans, and comments in Spanish.",
    "However, ALL code (variable names, function names, code comments, commit messages, file names) MUST remain in English.",
    "You understand and can process tickets written in both English and Spanish.",
  ].join("\n");
}
