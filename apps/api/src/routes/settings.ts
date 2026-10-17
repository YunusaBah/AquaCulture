import { Router } from 'express';
import { changePassword, getTheme, getUserPermissions, updateProfile, updateTheme, updateUserPermissions } from '../controllers/settings';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.get('/theme', requireAuth, getTheme);
router.put('/theme', requireAuth, updateTheme);
router.put('/profile', requireAuth, updateProfile);
router.put('/password', requireAuth, changePassword);
router.get('/permissions', requireAuth, getUserPermissions);
router.put('/permissions/:userId', requireAuth, requireRole('OWNER'), updateUserPermissions);

export default router;
