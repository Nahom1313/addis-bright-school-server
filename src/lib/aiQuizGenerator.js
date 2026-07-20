import { getGroqClient, sleep, isRetryableGroqError } from './groqClient.js';

const buildPrompt = ({ subject, topic, numQuestions, difficulty, sourceText }) => `
You are a school assessment writer helping a teacher create a multiple-choice practice quiz.

SUBJECT: ${subject}
TOPIC / INSTRUCTIONS: ${topic}
DIFFICULTY: ${difficulty}
NUMBER OF QUESTIONS: ${numQuestions}
${sourceText ? `\nSOURCE MATERIAL to base questions on (use this content directly, don't invent facts outside it):\n"""\n${sourceText}\n"""\n` : ''}

Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences:

{
  "questions": [
    {
      "questionText": "The question, max 300 chars",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "points": 1
    }
  ]
}

Rules:
- Exactly ${numQuestions} questions.
- Each question needs 3-4 plausible options — wrong options should be believable, not silly.
- correctIndex is the 0-based index of the correct option in that question's "options" array.
- Questions must be factually accurate and appropriate for a school setting.
- If source material is provided, base questions only on that material.
- Vary which option index is correct across questions — don't always put the answer at index 0.
`.trim();

const validateQuestion = (q) => {
  if (!q || typeof q.questionText !== 'string' || !q.questionText.trim()) return null;
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return null;
  const options = q.options.map(o => String(o).trim()).filter(Boolean);
  if (options.length < 2) return null;
  const correctIndex = Number(q.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;
  const points = Number(q.points) || 1;
  return {
    questionText: String(q.questionText).trim().slice(0, 300),
    options,
    correctIndex,
    points: Math.min(Math.max(Math.round(points), 1), 100),
  };
};

const generateQuizWithRetry = async ({ subject, topic, numQuestions, difficulty = 'medium', sourceText = '' }, maxRetries = 3) => {
  const groq = getGroqClient();
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: buildPrompt({ subject, topic, numQuestions, difficulty, sourceText: sourceText?.slice(0, 4000) }) }],
        temperature: 0.6,
        max_completion_tokens: 500 + numQuestions * 250,
        // See aiEnrichment.js for why these are needed — GPT-OSS models
        // include reasoning text by default, which can eat the token
        // budget and truncate the JSON before it completes. This risk is
        // higher here than in aiEnrichment.js since generating several
        // questions needs more output tokens to begin with.
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

      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('AI response had no usable questions');
      }

      const questions = parsed.questions.map(validateQuestion).filter(Boolean);
      if (questions.length === 0) {
        throw new Error('AI response questions failed validation');
      }

      return questions;
    } catch (err) {
      lastError = err;
      const isRetryable = isRetryableGroqError(err) || err instanceof SyntaxError || err.message?.includes('validation') || err.message?.includes('usable questions');
      if (!isRetryable || attempt === maxRetries) break;

      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[Groq quiz-gen] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError;
};

export default generateQuizWithRetry;
