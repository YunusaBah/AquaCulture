import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotificationForUser } from './notifications';

export async function listTasks(req: AuthRequest, res: Response) {
  const where = req.userRole === 'WORKER' ? { assignees: { some: { userId: req.userId } } } : {};
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

  const task = await prisma.task.create({
    data: {
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
  });

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
  const task = await prisma.task.findUnique({
    where: { id },
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
    const assignment = await prisma.taskAssignment.findFirst({ where: { taskId: id, userId: req.userId } });
    if (!assignment) return res.status(403).json({ error: 'Forbidden' });
  }

  // Cast incoming string to the generated enum type via any to satisfy TS
  const task = await prisma.task.update({ where: { id }, data: { status: status as any } });
  res.json({ task });
}

export async function addComment(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { message } = req.body as { message?: string };
  if (!message) return res.status(400).json({ error: 'message is required' });

  const comment = await prisma.taskComment.create({ data: { taskId: id, userId: req.userId!, message } });
  res.status(201).json({ comment });
}
