import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import statusLogController from '../controllers/statusLogController.js';
import { protect }         from '../middleware/auth.js';
import { restrictTo }      from '../middleware/rbac.js';
import { validate }        from '../middleware/validate.js';
import { createStatusLogSchema } from '../validators/statusLogValidators.js';

const router = Router();

router.use(protect);

// Dedicated rate limiter for log creation — protects Anthropic API spend.
// 30 logs per teacher per 10 minutes is generous for real use.
const logCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 30,
  keyGenerator: (req) => String(req.user?._id || req.ip), // per teacher
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many status logs submitted. Please wait a few minutes before trying again.',
  },
});

// Parent: read their own children's feed
router.get('/feed',
  restrictTo('parent'),
  statusLogController.getFeed
);

// Teacher: read logs they wrote
router.get('/my',
  restrictTo('teacher'),
  statusLogController.getMine
);

// Teacher / Director: read logs for a specific student
router.get('/student/:studentId',
  restrictTo('teacher', 'director'),
  statusLogController.getByStudent
);

// Teacher / Director: read all logs for a section
router.get('/section/:sectionId',
  restrictTo('teacher', 'director'),
  statusLogController.getBySection
);

// Teacher: create a new log — rate limited
router.post('/',
  restrictTo('teacher'),
  logCreateLimiter,
  validate(createStatusLogSchema),
  statusLogController.create
);

// Teacher (own) or Director: delete a log
router.delete('/:id',
  restrictTo('teacher', 'director'),
  statusLogController.deleteLog
);

export default router;

// Translate a log summary to Amharic — any authenticated role
import Groq from 'groq-sdk';
let _groq = null;
const groq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

router.post('/translate', logCreateLimiter, async (req, res, next) => {
  try {
    const { summary, suggestedAction } = req.body;
    if (!summary) return res.status(400).json({ success: false, message: 'summary is required' });

    const prompt = `Translate the following school communication text from English to Amharic (Ethiopian). 
Return ONLY a JSON object with no markdown, no explanation:
{"summary": "<amharic translation>", "suggestedAction": ${suggestedAction ? `"<amharic translation>"` : 'null'}}

Summary: "${summary}"
${suggestedAction ? `Suggested action: "${suggestedAction}"` : ''}`;

    const completion = await groq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    });

    const text   = completion.choices[0]?.message?.content || '';
    const clean  = text.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);

    res.json({ success: true, data: parsed });
  } catch (err) { next(err); }
});
