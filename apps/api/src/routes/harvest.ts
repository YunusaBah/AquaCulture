import express from 'express';
import { requireAuth } from '../middleware/auth';
import { getHarvests, createHarvest } from '../controllers/harvest';

const router = express.Router();

router.get('/', requireAuth, getHarvests);
router.post('/', requireAuth, createHarvest);

export default router;
