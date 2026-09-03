import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import farmRoutes from './routes/farms';
import pondRoutes from './routes/ponds';
import feedingRoutes from './routes/feeding';
import waterRoutes from './routes/water';
import mortalityRoutes from './routes/mortality';
import inventoryRoutes from './routes/inventory';
import financeRoutes from './routes/finance';
import taskRoutes from './routes/tasks';
import notificationRoutes from './routes/notifications';
import aiRoutes from './routes/ai';
import siteRoutes from './routes/sites';
import syncRoutes from './routes/sync';
import { PORT } from './config';

const app = express();
app.use(morgan('dev'));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Serve uploaded files from /uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/ponds', pondRoutes);
app.use('/api/feedings', feedingRoutes);
app.use('/api/water-quality', waterRoutes);
app.use('/api/mortality', mortalityRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/sync', syncRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
