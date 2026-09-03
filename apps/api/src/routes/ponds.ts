import { Router } from 'express';
import { getPonds, createPond, deletePond, getPond, updatePond, photoUploadMiddleware, uploadPondPhoto, getPondQr } from '../controllers/ponds';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';

const router = Router();
router.get('/', requireAuth, getPonds);
router.post('/', requireAuth, requirePermission('POND_CREATE'), createPond);
router.get('/:id', requireAuth, getPond);
router.put('/:id', requireAuth, requirePermission('POND_UPDATE'), updatePond);
router.delete('/:id', requireAuth, requirePermission('POND_ARCHIVE'), deletePond);
// photo upload
router.post('/:id/photos', requireAuth, photoUploadMiddleware(), uploadPondPhoto);
// QR
router.get('/:id/qr', requireAuth, getPondQr);

export default router;
