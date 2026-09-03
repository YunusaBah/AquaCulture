import { Router } from 'express';
import { listAiReports, createAiReport, createConversation, addMessage, generateSuggestion } from '../controllers/ai';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();
router.get('/reports', requireAuth, requirePermission('AI_VIEW'), listAiReports);
router.post('/reports', requireAuth, requirePermission('AI_USE'), createAiReport);
router.post('/suggest', requireAuth, requirePermission('AI_USE'), generateSuggestion);
router.post('/conversations', requireAuth, requirePermission('AI_USE'), createConversation);
router.post('/conversations/:conversationId/messages', requireAuth, requirePermission('AI_USE'), addMessage);

export default router;
