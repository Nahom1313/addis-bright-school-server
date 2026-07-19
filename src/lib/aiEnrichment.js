import Groq from 'groq-sdk';

let client = null;

const getClient = () => {
  if (!client) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'replace_me') {
      throw new Error('GROQ_API_KEY is not configured in server/.env');
    }
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
};

const buildPrompt = (rawNote, studentName, teacherName) => `
You are a school communication assistant helping teachers write encouraging, constructive status updates for parents.

A teacher has written a quick raw note about a student. Turn it into a structured, warm, professional update.

TEACHER: ${teacherName}
STUDENT: ${studentName}
RAW NOTE: "${rawNote}"

Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences:

{
  "summary": "One clear encouraging sentence (max 120 chars) a parent would appreciate.",
  "tone": "positive" | "neutral" | "concern",
  "category": "attendance" | "behaviour" | "academic" | "social" | "health" | "general",
  "suggestedAction": "Short practical suggestion for the parent (max 100 chars), or null."
}

Rules:
- tone "concern" only for serious issues (repeated absences, safety, significant academic risk)
- suggestedAction: null if the note is purely positive or routine
- Be warm, specific, and parent-friendly
`.trim();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const enrichWithRetry = async (rawNote, studentName, teacherName, maxRetries = 3) => {
  const groq = getClient();
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',  // recommended replacement for llama-3.1-8b-instant (June 2026)
        messages: [{ role: 'user', content: buildPrompt(rawNote, studentName, teacherName) }],
        temperature: 0.4,
        max_completion_tokens: 500,
        // GPT-OSS models include their internal reasoning/chain-of-thought
        // text in the response by default (include_reasoning defaults to
        // true on Groq). That reasoning text was eating into the token
        // budget and leaving the actual JSON answer truncated mid-output —
        // this is what caused "Unexpected end of JSON input" on every call.
        include_reasoning: false,
        reasoning_effort: 'low',
        // Force strict JSON output as a second layer of protection.
        response_format: { type: 'json_object' },
      });

      const text  = completion.choices[0]?.message?.content || '';
      let clean = text.replace(/```json|```/gi, '').trim();
      // Defense-in-depth: even with the above, extract just the {...}
      // portion in case any stray text still surrounds it.
      const firstBrace = clean.indexOf('{');
      const lastBrace  = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      const parsed = JSON.parse(clean);

      if (!parsed.summary || !parsed.tone || !parsed.category) {
        throw new Error('AI response missing required fields');
      }

      return {
        summary:         String(parsed.summary).slice(0, 200),
        tone:            ['positive', 'neutral', 'concern'].includes(parsed.tone) ? parsed.tone : 'neutral',
        category:        ['attendance', 'behaviour', 'academic', 'social', 'health', 'general'].includes(parsed.category) ? parsed.category : 'general',
        suggestedAction: parsed.suggestedAction ? String(parsed.suggestedAction).slice(0, 150) : null,
      };
    } catch (err) {
      lastError = err;

      const isRetryable =
        err.status >= 500 ||
        err.status === 429 ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';

      if (!isRetryable || attempt === maxRetries) break;

      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[Groq] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError;
};

export default enrichWithRetry;