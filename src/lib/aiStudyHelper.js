import { getGroqClient, isRetryableGroqError, sleep } from './groqClient.js';

const buildSystemPrompt = (subject, sourceResources) => {
  const hasContext = sourceResources.length > 0;
  const contextBlock = hasContext
    ? sourceResources.map((r, i) => `--- Source ${i + 1}: "${r.title}" ---\n${r.extractedText}`).join('\n\n')
    : '';

  return `
You are a patient, encouraging study tutor helping a student with ${subject}.

${hasContext
    ? `You have access to the student's actual class materials below. Ground your answers in this material whenever it's relevant, and say so naturally (e.g. "According to your notes on...").\n\n${contextBlock}`
    : `No specific class materials are available for this subject yet, so answer from your general knowledge of ${subject} at a school level.`}

Rules:
- Keep answers focused and clear — a paragraph or two, or a short list if that fits the question better. Not an essay.
- If a question is unrelated to schoolwork/${subject}, gently redirect the student back to their studies.
- If you're not sure of something, say so rather than guessing confidently.
- Never do a student's homework/quiz for them verbatim — explain concepts and guide their thinking instead of just handing over final answers to what look like assignment questions.
- Be warm and encouraging, like a good tutor, not clinical.
`.trim();
};

const generateStudyHelperReply = async ({ subject, message, history, sourceResources }, maxRetries = 3) => {
  const groq = getGroqClient();
  let lastError;

  const messages = [
    { role: 'system', content: buildSystemPrompt(subject, sourceResources) },
    ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 2000) })),
    { role: 'user', content: message },
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages,
        temperature: 0.5,
        max_completion_tokens: 700,
        // GPT-OSS models include reasoning/chain-of-thought text by default
        // (include_reasoning defaults to true on Groq), which eats into the
        // token budget and can either truncate the tutor's reply mid-sentence
        // or leak raw reasoning text into what the student sees.
        include_reasoning: false,
        reasoning_effort: 'low',
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) throw new Error('Empty reply from AI');
      return reply;
    } catch (err) {
      lastError = err;
      if (!isRetryableGroqError(err) || attempt === maxRetries) break;
      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[Groq study-helper] Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError;
};

export default generateStudyHelperReply;
