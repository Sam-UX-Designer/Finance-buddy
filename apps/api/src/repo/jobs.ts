import type { JobDTO, JobStatus, JobStep, StepStatus } from '@moneymate/core';
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

export function createJob(ctx: AppContext, userId: string, kind: JobRow['kind'], steps: { key: string; label: string }[]): JobDTO {
  const id = newId('job');
  const now = nowISO(ctx);
  const s: JobStep[] = steps.map((x) => ({ ...x, status: 'PENDING' }));
  ctx.db.run('INSERT INTO jobs (id, user_id, kind, status, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, userId, kind, 'RUNNING', JSON.stringify(s), now, now);
  return getJob(ctx, userId, id)!;
}

export function getJob(ctx: AppContext, userId: string, id: string): JobDTO | undefined {
  const row = ctx.db.get<JobRow>('SELECT * FROM jobs WHERE user_id = ? AND id = ?', userId, id);
  return row ? toDTO(row) : undefined;
}

export function latestJob(ctx: AppContext, userId: string, kind: JobRow['kind']): JobDTO | undefined {
  const row = ctx.db.get<JobRow>('SELECT * FROM jobs WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', userId, kind);
  return row ? toDTO(row) : undefined;
}

export function setStep(ctx: AppContext, jobId: string, key: string, status: StepStatus): void {
  const row = ctx.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', jobId);
  if (!row) return;
  const steps: JobStep[] = JSON.parse(row.steps);
  const step = steps.find((s) => s.key === key);
  if (step) step.status = status;
  ctx.db.run('UPDATE jobs SET steps = ?, updated_at = ? WHERE id = ?', JSON.stringify(steps), nowISO(ctx), jobId);
}

export function finishJob(ctx: AppContext, jobId: string, status: JobStatus, error: string | null = null): void {
  ctx.db.run('UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?', status, error, nowISO(ctx), jobId);
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
