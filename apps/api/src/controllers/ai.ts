import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateAiSuggestion } from '../lib/aiProvider';
import { AuthRequest } from '../middleware/auth';

export async function listAiReports(req: AuthRequest, res: Response) {
  const reports = await prisma.aiReport.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { user: true, conversation: true } });
  res.json({ reports });
}

export async function createAiReport(req: AuthRequest, res: Response) {
  const { title, content, conversationId } = req.body as { title?: string; content: string; conversationId?: string };
  if (!content) return res.status(400).json({ error: 'content is required' });

  const report = await prisma.aiReport.create({ data: { title, content, userId: req.userId || undefined, conversationId } });
  res.status(201).json({ report });
}

export async function createConversation(req: AuthRequest, res: Response) {
  const { title } = req.body as { title?: string };
  const conv = await prisma.aiConversation.create({ data: { title, userId: req.userId || undefined } });
  res.status(201).json({ conversation: conv });
}

export async function addMessage(req: AuthRequest, res: Response) {
  const { conversationId } = req.params;
  const { role, content, aiReportId } = req.body as { role: string; content: string; aiReportId?: string };
  if (!role || !content) return res.status(400).json({ error: 'role and content required' });

  const msg = await prisma.aiMessage.create({ data: { conversationId, role: role as any, content, aiReportId, userId: req.userId || undefined } });
  res.status(201).json({ message: msg });
}

export async function generateSuggestion(req: AuthRequest, res: Response) {
  const { note, context, title, conversationId } = req.body as {
    note?: string;
    context?: string;
    title?: string;
    conversationId?: string;
  };

  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'note is required' });
  }

  const result = await generateAiSuggestion({ note, context });
  const report = await prisma.aiReport.create({
    data: {
      title: title || 'AI pond recommendation',
      content: result.suggestion,
      userId: req.userId || undefined,
      conversationId,
    },
  });

  return res.status(200).json({
    suggestion: result.suggestion,
    provider: result.provider,
    report,
  });
}
