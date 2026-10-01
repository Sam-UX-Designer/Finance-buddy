import type { JobDTO, JobStatus, JobStep, StepStatus } from '@finance-buddy/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';

interface JobRow {
  id: string;
  user_id: string;
  kind: 'DISCOVERY' | 'SYNC';
  status: JobStatus;
  steps: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function createJob(ctx: AppContext, userId: string, kind: JobRow['kind'], steps: { key: string; label: string }[]): Promise<JobDTO> {
  const id = newId('job');
  const now = nowISO(ctx);
  const s: JobStep[] = steps.map((x) => ({ ...x, status: 'PENDING' }));
  await ctx.db.run('INSERT INTO jobs (id, user_id, kind, status, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, userId, kind, 'RUNNING', JSON.stringify(s), now, now);
  return (await getJob(ctx, userId, id))!;
}

export async function getJob(ctx: AppContext, userId: string, id: string): Promise<JobDTO | undefined> {
  const row = await ctx.db.get<JobRow>('SELECT * FROM jobs WHERE user_id = ? AND id = ?', userId, id);
  return row ? toDTO(row) : undefined;
}

export async function latestJob(ctx: AppContext, userId: string, kind: JobRow['kind']): Promise<JobDTO | undefined> {
  const row = await ctx.db.get<JobRow>('SELECT * FROM jobs WHERE user_id = ? AND kind = ? ORDER BY n DESC LIMIT 1', userId, kind);
  return row ? toDTO(row) : undefined;
}

export async function setStep(ctx: AppContext, jobId: string, key: string, status: StepStatus): Promise<void> {
  const row = await ctx.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', jobId);
  if (!row) return;
  const steps: JobStep[] = JSON.parse(row.steps);
  const step = steps.find((s) => s.key === key);
  if (step) step.status = status;
  await ctx.db.run('UPDATE jobs SET steps = ?, updated_at = ? WHERE id = ?', JSON.stringify(steps), nowISO(ctx), jobId);
}

export async function finishJob(ctx: AppContext, jobId: string, status: JobStatus, error: string | null = null): Promise<void> {
  await ctx.db.run('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?', status, error, nowISO(ctx), jobId);
}

function toDTO(row: JobRow): JobDTO {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    steps: JSON.parse(row.steps),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
