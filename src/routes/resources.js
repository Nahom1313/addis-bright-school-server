import { Router } from 'express';
import { z } from 'zod';
import Resource from '../models/Resource.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { handleResourceUpload, cloudinary } from '../middleware/upload.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
router.use(protect);

// ─── Validators ───────────────────────────────────────────────────
const createSchema = z.object({
  subject:     z.string().min(1).max(100),
  title:       z.string().min(1).max(150),
  description: z.string().max(1000).optional().nullable(),
  type:        z.enum(['file', 'link', 'video']),
  externalUrl: z.string().url('Must be a valid URL').optional().nullable(),
});

const updateSchema = z.object({
  subject:     z.string().min(1).max(100).optional(),
  title:       z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
});

const populateResource = (q) => q.populate('teacherId', 'firstName lastName');

// ─── GET /api/resources — everyone (all roles) can browse, filterable by subject ───
router.get('/', async (req, res, next) => {
  try {
    const { subject, type, q } = req.query;
    const filter = { isActive: true };
    if (subject) filter.subject = subject;
    if (type)    filter.type = type;
    if (q)       filter.title = { $regex: String(q).slice(0, 100), $options: 'i' };

    const resources = await populateResource(
      Resource.find(filter).sort({ createdAt: -1 })
    );
    sendSuccess(res, { resources });
  } catch (err) { next(err); }
});

// ─── GET /api/resources/subjects — distinct subject list, for the filter dropdown ───
router.get('/subjects', async (req, res, next) => {
  try {
    const subjects = await Resource.distinct('subject', { isActive: true });
    sendSuccess(res, { subjects: subjects.sort() });
  } catch (err) { next(err); }
});

// ─── GET /api/resources/mine — teacher sees only what they've uploaded ───
router.get('/mine', restrictTo('teacher'), async (req, res, next) => {
  try {
    const resources = await populateResource(
      Resource.find({ teacherId: req.user._id, isActive: true }).sort({ createdAt: -1 })
    );
    sendSuccess(res, { resources });
  } catch (err) { next(err); }
});

// ─── POST /api/resources — teacher uploads a file resource ────────
router.post('/', restrictTo('teacher'), handleResourceUpload, async (req, res, next) => {
  try {
    const body = { ...req.body, type: req.body.type || 'file' };
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }
    const data = parsed.data;

    if (data.type === 'file' && !req.file) {
      return sendError(res, 'Please attach a file, or choose "link"/"video" instead.', 422);
    }
    if (data.type !== 'file' && !data.externalUrl) {
      return sendError(res, 'A link or video resource needs a URL.', 422);
    }

    const resource = await Resource.create({
      ...data,
      teacherId: req.user._id,
      fileUrl:  data.type === 'file' ? req.file.filename : null,
      fileName: data.type === 'file' ? req.file.originalName : null,
    });

    const populated = await populateResource(Resource.findById(resource._id));
    sendSuccess(res, { resource: populated }, 'Resource added to the study library.', 201);
  } catch (err) { next(err); }
});

// ─── PATCH /api/resources/:id — teacher edits their own resource's metadata ───
router.patch('/:id', restrictTo('teacher'), async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) return sendError(res, 'Resource not found.', 404);
    if (String(resource.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only edit your own resources.', 403);
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }

    Object.assign(resource, parsed.data);
    await resource.save();
    const populated = await populateResource(Resource.findById(resource._id));
    sendSuccess(res, { resource: populated }, 'Resource updated.');
  } catch (err) { next(err); }
});

// ─── DELETE /api/resources/:id — teacher deletes their own (soft delete + Cloudinary cleanup) ───
router.delete('/:id', restrictTo('teacher'), async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) return sendError(res, 'Resource not found.', 404);
    if (String(resource.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only delete your own resources.', 403);
    }

    resource.isActive = false;
    await resource.save();

    // Best-effort Cloudinary cleanup — never block the response on this
    if (resource.type === 'file' && resource.fileUrl) {
      const match = resource.fileUrl.match(/school-platform\/resources\/([^./]+)/);
      if (match) {
        cloudinary.uploader.destroy(`school-platform/resources/${match[1]}`, { resource_type: 'auto' })
          .catch(err => console.error('[resources] Cloudinary cleanup failed:', err.message));
      }
    }

    sendSuccess(res, {}, 'Resource removed.');
  } catch (err) { next(err); }
});

// ─── POST /api/resources/:id/download — track a download/click (fire-and-forget from the client) ───
router.post('/:id/download', async (req, res, next) => {
  try {
    await Resource.updateOne({ _id: req.params.id, isActive: true }, { $inc: { downloadCount: 1 } });
    sendSuccess(res, {});
  } catch (err) { next(err); }
});

export default router;
