import express from 'express';
import { requireAuth } from '../middleware/auth';
import { getHarvests, createHarvest, deleteHarvest } from '../controllers/harvest';

const router = express.Router();

router.get('/', requireAuth, getHarvests);
router.post('/', requireAuth, createHarvest);
router.delete('/:id', requireAuth, deleteHarvest);

export default router;
