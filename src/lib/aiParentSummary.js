import { getGroqClient, sleep, isRetryableGroqError } from './groqClient.js';

const buildPrompt = ({ studentName, marksBySubject, attendance, recentLogs, lang }) => {
  const marksLines = marksBySubject.length
    ? marksBySubject.map(m => `- ${m.subject}: ${m.avgPct}% average (${m.count} grade${m.count !== 1 ? 's' : ''} recorded)`).join('\n')
    : '(No grades recorded yet)';

  const attendanceLine = attendance.total > 0
    ? `${attendance.rate}% attendance over the last ${attendance.total} recorded school days (${attendance.present} present, ${attendance.absent} absent, ${attendance.late} late, ${attendance.excused} excused).`
    : '(No attendance recorded yet)';

  const logsLines = recentLogs.length
    ? recentLogs.map(l => `- [${l.tone}/${l.category}] ${l.summary}`).join('\n')
    : '(No recent teacher notes)';

  return `
You are a warm, encouraging school assistant writing a short summary for a parent about their child's recent progress.

STUDENT: ${studentName}
LANGUAGE: Write the summary entirely in ${lang === 'am' ? 'Amharic (Ethiopian)' : 'English'}.

RECENT GRADES BY SUBJECT:
${marksLines}

ATTENDANCE:
${attendanceLine}

RECENT TEACHER NOTES (most recent first):
${logsLines}

Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences:

{
  "summary": "A warm 3-5 sentence paragraph a busy parent can read in 15 seconds. Mention strengths first, then anything worth attention, end on an encouraging note. Use the child's first name naturally. Do not invent facts not present above — if data is missing for something, don't mention it rather than guessing."
}

Rules:
- Be specific where you have data (mention actual subjects/percentages/attendance rate), general where you don't.
- Never sound alarming — if there's a concern, frame it constructively with what the parent could do.
- Keep it to one paragraph, no bullet points, no headers.
`.trim();
};

const generateParentSummaryWithRetry = async (input, maxRetries = 3) => {
  const groq = getGroqClient();
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: buildPrompt(input) }],
        temperature: 0.5,
        max_completion_tokens: 600,
        // GPT-OSS models include reasoning text by default (include_reasoning
        // defaults to true on Groq), which eats into the token budget and
        // truncates the JSON before it completes — this is the same bug
        // fixed in aiEnrichment.js and aiQuizGenerator.js.
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

      if (!parsed.summary || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
        throw new Error('AI response missing summary field');
      }

      return parsed.summary.trim().slice(0, 1200);
    } catch (err) {
      lastError = err;
      const isRetryable = isRetryableGroqError(err) || err instanceof SyntaxError || err.message?.includes('missing summary');
      if (!isRetryable || attempt === maxRetries) break;

      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[Groq parent-summary] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError;
};

export default generateParentSummaryWithRetry;
