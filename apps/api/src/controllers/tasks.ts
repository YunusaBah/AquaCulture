import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';
import { nextReportReference } from '../lib/financeTransactionId';

export async function listTasks(req: AuthRequest, res: Response) {
  const where = {
    tenantId: req.tenantId,
    ...(req.userRole === 'WORKER' ? { assignees: { some: { userId: req.userId } } } : {}),
  };
  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { assignees: { include: { user: true } }, comments: { include: { user: true } }, creator: true },
  });
  res.json({ tasks });
}

export async function createTask(req: AuthRequest, res: Response) {
  if (req.userRole === 'WORKER') {
    return res.status(403).json({ error: 'Workers cannot create tasks' });
  }

  const { title, description, assigneeIds, dueAt, priority, checklist } = req.body as any;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const normalizedAssignees = Array.isArray(assigneeIds) ? assigneeIds : [];
  const validAssignees = await prisma.user.findMany({
    where: { id: { in: normalizedAssignees }, adminId: req.tenantId, role: { name: 'WORKER' } },
    select: { id: true },
  });
  if (validAssignees.length !== normalizedAssignees.length) {
    return res.status(400).json({ error: 'All assignees must be workers in this workspace.' });
  }

  const task = await prisma.$transaction(async (tx) => tx.task.create({
    data: {
      reportId: await nextReportReference(tx),
      tenantId: req.tenantId!,
      title,
      description,
      creatorId: req.userId!,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      priority: priority || 'MEDIUM',
      checklist: checklist ? JSON.parse(JSON.stringify(checklist)) : undefined,
      assignees: {
        create: (assigneeIds || []).map((id: string) => ({ userId: id })),
      },
    },
    include: { assignees: { include: { user: true } }, creator: true },
  }));

  await Promise.all((assigneeIds || []).map((userId: string) => createNotificationForUser(
    userId,
    'New task assigned',
    `${req.user?.name || 'Farm Owner'} assigned: ${task.title}`,
    { taskId: task.id, type: 'TASK_ASSIGNED' },
  )));

  res.status(201).json({ task });
}

export async function getTask(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const task = await prisma.task.findFirst({
    where: { id, tenantId: req.tenantId },
    include: { assignees: { include: { user: true } }, comments: { include: { user: true } }, creator: true },
  });
  if (!task) return res.status(404).json({ error: 'Not found' });
  const isAssignedWorker = task.assignees.some((assignment) => assignment.userId === req.userId);
  if (req.userRole === 'WORKER' && !isAssignedWorker) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ task });
}

export async function updateTaskStatus(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body as { status?: string };
  if (!status) return res.status(400).json({ error: 'status is required' });
  if (req.userRole === 'WORKER') {
    const assignment = await prisma.taskAssignment.findFirst({ where: { taskId: id, userId: req.userId, task: { tenantId: req.tenantId } } });
    if (!assignment) return res.status(403).json({ error: 'Forbidden' });
  }

  const ownedTask = await prisma.task.findFirst({ where: { id, tenantId: req.tenantId }, select: { id: true } });
  if (!ownedTask) return res.status(404).json({ error: 'Task not found' });

  // Cast incoming string to the generated enum type via any to satisfy TS
  const task = await prisma.task.update({
    where: { id },
    data: {
      status: status as any,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
    include: { assignees: { include: { user: true } }, creator: true },
  });
  res.json({ task });
}

export async function addComment(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { message } = req.body as { message?: string };
  if (!message) return res.status(400).json({ error: 'message is required' });

  const task = await prisma.task.findFirst({
    where: {
      id,
      tenantId: req.tenantId,
      ...(req.userRole === 'WORKER' ? { assignees: { some: { userId: req.userId } } } : {}),
    },
    select: { id: true },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comment = await prisma.taskComment.create({ data: { taskId: id, userId: req.userId!, message } });
  res.status(201).json({ comment });
}
