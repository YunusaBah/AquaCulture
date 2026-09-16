import { Router } from 'express';
import { clearChatMessages, createChatMessage, deleteChatMessage, listChatMessages } from '../controllers/chat';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/messages', requireAuth, listChatMessages);
router.post('/messages', requireAuth, createChatMessage);
router.delete('/messages', requireAuth, clearChatMessages);
router.delete('/messages/:id', requireAuth, deleteChatMessage);

export default router;
