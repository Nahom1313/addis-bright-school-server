import { getGroqClient, isRetryableGroqError, sleep } from './groqClient.js';

const buildPrompt = ({ overview, sections }) => {
  const marksLines = overview.marksBySubject.length
    ? overview.marksBySubject.map(m => `- ${m.subject}: ${m.avg}% average (${m.count} grades recorded)`).join('\n')
    : '(No grade data yet)';

  const sectionLines = sections.length
    ? sections.map(s => `- ${s.section}: ${s.attendanceRate !== null ? `${s.attendanceRate}% attendance` : 'no attendance data'}, ${s.avgMark !== null ? `${s.avgMark}% avg mark` : 'no marks data'}`).join('\n')
    : '(No per-section data yet)';

  const toneLines = overview.logsByTone.length
    ? overview.logsByTone.map(t => `${t.tone}: ${t.count}`).join(', ')
    : '(none)';

  return `
You are a data analyst helping a school director/registrar understand what's happening in their school right now, based on the last 30 days of data.

SCHOOL TOTALS: ${overview.totals.students} students, ${overview.totals.teachers} teachers, ${overview.totals.parents} parents. ${overview.totals.newStudents7} new students in the last 7 days.

OVERALL ATTENDANCE (last 30 days): ${overview.attendance.rate !== null ? `${overview.attendance.rate}% (${overview.attendance.total} records: ${overview.attendance.present} present, ${overview.attendance.absent} absent, ${overview.attendance.late} late, ${overview.attendance.excused} excused)` : 'No attendance data yet'}

AVERAGE MARKS BY SUBJECT:
${marksLines}

PER-SECTION BREAKDOWN (last 30 days):
${sectionLines}

TEACHER STATUS LOG TONE (last 30 days, AI-classified): ${toneLines}

Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences:

{
  "headline": "One short, specific sentence capturing the single most important thing to know right now (max 100 chars).",
  "insights": [
    "2-4 short, specific, actionable observations (each max 150 chars). Call out actual numbers, subjects, or sections by name when the data supports it. Mix positives and concerns — don't only report bad news.",
    "..."
  ]
}

Rules:
- Every claim must be traceable to the numbers given above — never invent a section, subject, or trend not present in the data.
- If a section or subject stands out (notably higher/lower than the rest), call it out specifically by name.
- If there isn't enough data yet for a meaningful insight in some area, don't force one — it's fine to have fewer than 4 insights.
- Write for a busy administrator skimming on their phone — short, concrete sentences, no fluff.
`.trim();
};

const generateInsightsWithRetry = async ({ overview, sections }, maxRetries = 3) => {
  const groq = getGroqClient();
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: buildPrompt({ overview, sections }) }],
        temperature: 0.4,
        max_completion_tokens: 600,
        // See aiEnrichment.js for why these are needed — GPT-OSS models
        // include reasoning text by default, which eats the token budget
        // and truncates the JSON before it completes.
        include_reasoning: false,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '';
      let clean = text.replace(/```json|```/gi, '').trim();
      const firstBrace = clean.indexOf('{');
      const lastBrace  = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      const parsed = JSON.parse(clean);

      if (!parsed.headline || !Array.isArray(parsed.insights) || parsed.insights.length === 0) {
        throw new Error('AI response missing required fields');
      }

      return {
        headline: String(parsed.headline).slice(0, 150),
        insights: parsed.insights.map(i => String(i).slice(0, 200)).slice(0, 6),
      };
    } catch (err) {
      lastError = err;
      const isRetryable = isRetryableGroqError(err) || err instanceof SyntaxError || err.message?.includes('missing required');
      if (!isRetryable || attempt === maxRetries) break;
      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[Groq analytics-insights] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError;
};

export default generateInsightsWithRetry;
