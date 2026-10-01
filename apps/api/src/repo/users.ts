import type { MeDTO, OnboardingState, ThemePreference } from '@finance-buddy/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';

export interface UserRow {
  id: string;
  phone_hash: string;
  phone_enc: string;
  phone_last4: string;
  name_enc: string | null;
  onboarding_state: OnboardingState;
  theme_preference: ThemePreference;
  data_version: number;
  created_at: string;
  updated_at: string;
}

export function findUserByPhone(ctx: AppContext, phone: string): Promise<UserRow | undefined> {
  return ctx.db.get<UserRow>('SELECT * FROM users WHERE phone_hash = ?', ctx.vault.lookupHash(phone));
}

export function getUser(ctx: AppContext, id: string): Promise<UserRow | undefined> {
  return ctx.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export async function createUser(ctx: AppContext, phone: string): Promise<UserRow> {
  const id = newId('usr');
  const now = nowISO(ctx);
  await ctx.db.run(
    `INSERT INTO users (id, phone_hash, phone_enc, phone_last4, onboarding_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PHONE_VERIFIED', ?, ?)`,
    id,
    ctx.vault.lookupHash(phone),
    ctx.vault.encrypt(phone),
    phone.slice(-4),
    now,
    now,
  );
  return (await getUser(ctx, id))!;
}

export function userPhone(ctx: AppContext, user: UserRow): string {
  return ctx.vault.decrypt(user.phone_enc);
}

export function userName(ctx: AppContext, user: UserRow): string | null {
  return ctx.vault.decryptNullable(user.name_enc);
}

export async function setOnboardingState(ctx: AppContext, userId: string, state: OnboardingState): Promise<void> {
  await ctx.db.run('UPDATE users SET onboarding_state = ?, updated_at = ? WHERE id = ?', state, nowISO(ctx), userId);
}

export async function updateProfile(ctx: AppContext, userId: string, patch: { name?: string | null; themePreference?: ThemePreference }): Promise<void> {
  if (patch.name !== undefined) {
    await ctx.db.run('UPDATE users SET name_enc = ?, updated_at = ? WHERE id = ?', ctx.vault.encryptNullable(patch.name?.trim() || null), nowISO(ctx), userId);
  }
  if (patch.themePreference) {
    await ctx.db.run('UPDATE users SET theme_preference = ?, updated_at = ? WHERE id = ?', patch.themePreference, nowISO(ctx), userId);
  }
}

/** Invalidates cached financial state for the user. Call after any write that affects numbers. */
export async function bumpDataVersion(ctx: AppContext, userId: string): Promise<void> {
  await ctx.db.run('UPDATE users SET data_version = data_version + 1 WHERE id = ?', userId);
}

export function toMeDTO(ctx: AppContext, user: UserRow): MeDTO {
  return {
    id: user.id,
    phoneMasked: `+91 ••••• ${user.phone_last4}`,
    name: userName(ctx, user),
    onboardingState: user.onboarding_state,
    themePreference: user.theme_preference,
    createdAt: user.created_at,
  };
}

export async function audit(ctx: AppContext, userId: string | null, event: string, detail?: Record<string, unknown>): Promise<void> {
  await ctx.db.run('INSERT INTO audit_events (id, user_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)', newId('aud'), userId, event, detail ? JSON.stringify(detail) : null, nowISO(ctx));
}
