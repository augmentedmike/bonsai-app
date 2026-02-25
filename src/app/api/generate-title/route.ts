import { NextResponse } from "next/server";
import { geminiRequest, extractText, GeminiKeyError } from "@/lib/gemini";

const MODEL = "gemini-2.5-flash";

const TOKEN_LIMITS: Record<string, number> = {
  title: 100,
  type: 20,
  criteria: 1024,
  enhance: 8192,
  massage: 8192,
  massage_criteria: 1024,
};

// field: "title" | "criteria" | "enhance"
export async function POST(req: Request) {
  const { description, field } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const prompts: Record<string, { text: string }> = {
    title: {
      text: `You are a software project manager writing a concise ticket title.

Read the ENTIRE description below. Identify the SINGLE OVERARCHING task or deliverable — what is the user asking to be built or done at the highest level?

CRITICAL RULES:
- Return ONLY the title text, nothing else
- No quotes, no punctuation at the end, no preamble
- NEVER return meta-text like "Task description missing" or "Error"
- The title MUST capture the TOP-LEVEL deliverable, NOT a random sub-detail
- If the description contains multiple steps, sections, or bullet points, the title should describe THE WHOLE THING (e.g. "Add How It Works section to homepage"), not one sub-item
- If the first line or sentence names the feature (e.g. "Homepage how it works section"), use that as the basis for the title
- Use imperative form: "Add X", "Fix Y", "Build Z", "Create W"
- Max 8 words

Description:
${description.trim()}`,
    },
    criteria: {
      text: `Generate acceptance criteria for this task as a markdown checklist. Each item should be a concrete, testable condition. Use "- [ ]" format. Return 3-6 items, ONLY the checklist, no other text.\n\nDescription:\n${description.trim()}`,
    },
    enhance: {
      text: `Fix typos, spelling, grammar, and formatting in the text below. Keep the EXACT same content and meaning — do not rewrite, rephrase, or reorganize ideas. Do not add any information that isn't already there. Do not remove any information. Do not change technical terms, tool names, or stack choices.

Rules:
- Fix typos, spelling, grammar, and formatting issues
- Add paragraph breaks where natural thought breaks occur (blank lines between paragraphs)
- Use markdown formatting for emphasis where appropriate (bold **text**, bullet lists, etc.)
- Keep every detail, number, URL, and technical term exactly as written
- Keep the author's voice — do not make it formal or corporate
- Keep all image references ![...](...) exactly as-is
- Do NOT add new content, explanations, or details the author didn't write
- Do NOT rewrite sentences — only fix errors within them and format them nicely
- Do NOT summarize or change the order of ideas

Return ONLY the cleaned and formatted text, nothing else.

Text:
${description.trim()}`,
    },
    massage: {
      text: `Fix any typos, spelling errors, grammar issues, and bad formatting in this text. Keep the meaning, tone, and length exactly the same — only correct obvious mistakes. If the text is already clean, return it unchanged. Return ONLY the corrected text, nothing else.\n\nText:\n${description.trim()}`,
    },
    massage_criteria: {
      text: `Convert this spoken voice transcript into a clean markdown checklist of acceptance criteria. Each item should be a concrete, testable condition using "- [ ]" format. Fix any typos, spelling errors, and grammar. Interpret the speaker's intent and break it into clear, separate checklist items. Return ONLY the checklist, no other text.\n\nVoice transcript:\n${description.trim()}`,
    },
    type: {
      text: `You are a software project manager classifying a ticket. Based on the description below, determine what TYPE of work is being requested.

IMPORTANT: Focus on what the ticket is ASKING TO BE BUILT OR DONE, not what the description text looks like. If someone describes a new page, flow, UI, content, feature, or capability they want created — that is a feature, even if the description contains documentation-style writing or step-by-step guides.

Return EXACTLY one of these values (no quotes, no extra text):
- feature — building something new: new pages, UI, flows, content, integrations, capabilities, landing pages, onboarding steps, product copy
- bug — something existing is broken, has errors, wrong behavior, or needs a fix
- chore — purely internal maintenance with no user-facing change: dependency upgrades, CI/CD config, refactoring internals, renaming variables

When in doubt, choose feature. Most tickets are features.

Description:
${description.trim()}`,
    },
  };

  const config = prompts[field || "title"];
  if (!config) {
    return NextResponse.json({ error: "invalid field" }, { status: 400 });
  }

  console.log(`[generate-title] field=${field}, description length=${description.trim().length}`);

  try {
    const res = await geminiRequest(MODEL, {
      contents: [{ parts: [{ text: config.text }] }],
      generationConfig: { maxOutputTokens: TOKEN_LIMITS[field || "title"] || 1024 },
    });

    const data = await res.json();
    let text = extractText(data);
    if ((field === "enhance" || field === "massage") && text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    }
    console.log(`[generate-title] field=${field}, result length=${text.length}, result=${text.slice(0, 100)}`);
    return NextResponse.json({ [field || "title"]: text });
  } catch (err) {
    if (err instanceof GeminiKeyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
