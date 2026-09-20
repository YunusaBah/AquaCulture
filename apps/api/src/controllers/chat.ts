import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listChatMessages(_req: AuthRequest, res: Response) {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'asc' },
    take: 250,
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          name: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  res.json({
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      imageUrl: message.imageUrl,
      mentions: Array.isArray(message.mentions) ? message.mentions : [],
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        email: message.sender.email,
        name: message.sender.name,
        role: message.sender.role.name,
      },
    })),
  });
}

export async function createChatMessage(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { text, imageUrl, mentions } = req.body || {};
  const normalizedText = typeof text === 'string' ? text.trim().slice(0, 500) : '';
  const payloadImageUrl = typeof imageUrl === 'string' && imageUrl.length <= 2_000_000 ? imageUrl : null;
  const payloadMentions = Array.isArray(mentions) ? mentions.filter((item): item is string => typeof item === 'string') : [];

  if (!normalizedText && !payloadImageUrl) {
    return res.status(400).json({ error: 'Message text or image is required' });
  }

  const message = await prisma.chatMessage.create({
    data: {
      senderId: userId,
      text: normalizedText || null,
      imageUrl: payloadImageUrl,
      mentions: payloadMentions,
    },
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          name: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  res.status(201).json({
    message: {
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      imageUrl: message.imageUrl,
      mentions: Array.isArray(message.mentions) ? message.mentions : [],
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        email: message.sender.email,
        name: message.sender.name,
        role: message.sender.role.name,
      },
    },
  });
}

export async function deleteChatMessage(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const message = await prisma.chatMessage.findUnique({
    where: { id },
    select: { senderId: true },
  });

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (req.userRole !== 'OWNER' && message.senderId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await prisma.chatMessage.delete({ where: { id } });
  res.json({ success: true });
}

export async function clearChatMessages(req: AuthRequest, res: Response) {
  const scope = String(req.query.scope || 'mine');
  if (scope === 'all') {
    if (req.userRole !== 'OWNER') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.chatMessage.deleteMany({});
    return res.json({ success: true, clearedAll: true });
  }

  await prisma.chatMessage.deleteMany({ where: { senderId: req.userId! } });
  res.json({ success: true, clearedAll: false });
}
