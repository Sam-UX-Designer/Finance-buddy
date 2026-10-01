import type { DeviceSessionDTO, OtpRequestResponse, SessionResponse } from '@moneymate/core';
import { nowISO, type AppContext } from '../context';
import { badRequest, HttpError, tooMany, unauthorized } from '../lib/errors';
import { newId, newToken, randomDigits, safeEqual, sha256 } from '../lib/crypto';
import { RateLimiter } from '../lib/rate-limit';
import { audit, createUser, findUserByPhone, getUser, toMeDTO, type UserRow } from '../repo/users';
import { notify } from '../repo/misc';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const limiters = new WeakMap<AppContext, { perPhone: RateLimiter; perIp: RateLimiter }>();
function limitersFor(ctx: AppContext) {
  let l = limiters.get(ctx);
  if (!l) {
    l = { perPhone: new RateLimiter(5, 60 * 60 * 1000), perIp: new RateLimiter(20, 60 * 60 * 1000) };
    limiters.set(ctx, l);
  }
  return l;
}

/** Normalises Indian mobile numbers to 10 digits ("+91 98765 43210" → "9876543210"). */
export function normalisePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

interface ChallengeRow {
  id: string;
  phone_hash: string;
  phone_enc: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  resend_after: string;
  consumed_at: string | null;
}

export async function requestOtp(ctx: AppContext, rawPhone: string, ip: string): Promise<OtpRequestResponse> {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw badRequest('Enter a valid 10-digit Indian mobile number.', 'INVALID_PHONE');
  const phoneHash = ctx.vault.lookupHash(phone);
  const now = ctx.now();

  const last = ctx.db.get<ChallengeRow>('SELECT * FROM otp_challenges WHERE phone_hash = ? ORDER BY created_at DESC LIMIT 1', phoneHash);
  if (last && Date.parse(last.resend_after) > now.getTime()) {
    const wait = Math.ceil((Date.parse(last.resend_after) - now.getTime()) / 1000);
    throw tooMany(`Please wait ${wait}s before requesting another code.`, wait);
  }
  const { perIp, perPhone } = limitersFor(ctx);
  const ipWait = perIp.hit(ip, now.getTime());
  if (ipWait) throw tooMany('Too many attempts from this network. Try again later.', ipWait);
  const phoneWait = perPhone.hit(phoneHash, now.getTime());
  if (phoneWait) throw tooMany('Too many codes requested for this number. Try again later.', phoneWait);

  const id = newId('otp');
  const code = ctx.sms.fixedCode ?? randomDigits(6);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const resendAfter = new Date(now.getTime() + RESEND_AFTER_MS).toISOString();
  ctx.db.run(
    'INSERT INTO otp_challenges (id, phone_hash, phone_enc, code_hash, expires_at, resend_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, phoneHash, ctx.vault.encrypt(phone), sha256(`${id}:${code}`), expiresAt, resendAfter, now.toISOString(),
  );
  await ctx.sms.sendOtp(`+91${phone}`, code);
  return {
    challengeId: id,
    maskedPhone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
    expiresAt,
    resendAfter,
    ...(ctx.sms.name === 'dev' && ctx.sms.fixedCode ? { devHint: `Development mode: use ${ctx.sms.fixedCode}` } : {}),
  };
}

export async function verifyOtp(
  ctx: AppContext,
  body: { challengeId: string; code: string; deviceName?: string; platform?: string },
): Promise<SessionResponse> {
  const ch = ctx.db.get<ChallengeRow>('SELECT * FROM otp_challenges WHERE id = ?', body.challengeId);
  if (!ch || ch.consumed_at || Date.parse(ch.expires_at) < ctx.now().getTime()) {
    throw new HttpError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }
  if (ch.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
  if (!/^\d{6}$/.test(body.code) || !safeEqual(sha256(`${ch.id}:${body.code}`), ch.code_hash)) {
    ctx.db.run('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', ch.id);
    const left = MAX_ATTEMPTS - ch.attempts - 1;
    throw new HttpError(400, 'OTP_INVALID', left > 0 ? `That code didn't match. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.');
  }
  ctx.db.run('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', nowISO(ctx), ch.id);
  const phone = ctx.vault.decrypt(ch.phone_enc);
  let user = findUserByPhone(ctx, phone);
  const isNew = !user;
  user ??= createUser(ctx, phone);
  const token = createSession(ctx, user.id, body.deviceName ?? 'Unknown device', body.platform ?? 'unknown');
  audit(ctx, user.id, isNew ? 'USER_CREATED' : 'SIGNED_IN', { platform: body.platform ?? 'unknown' });
  if (!isNew) {
    notify(ctx, user.id, {
      kind: 'SECURITY',
      title: 'New sign-in',
      body: `Signed in on ${body.deviceName ?? 'a device'}. If this wasn't you, sign out other devices in Settings.`,
      link: '/settings',
      dedupeKey: `signin:${token.slice(0, 12)}`,
    });
  }
  return { token, user: toMeDTO(ctx, user) };
}

function createSession(ctx: AppContext, userId: string, deviceName: string, platform: string): string {
  const token = newToken();
  const now = ctx.now();
  ctx.db.run(
    'INSERT INTO device_sessions (id, user_id, token_hash, device_name, platform, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    newId('ses'), userId, sha256(token), deviceName.slice(0, 80), platform.slice(0, 20), now.toISOString(), now.toISOString(),
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  );
  return token;
}

export interface AuthedSession {
  user: UserRow;
  sessionId: string;
}

export function authenticate(ctx: AppContext, token: string | undefined): AuthedSession {
  if (!token) throw unauthorized();
  const s = ctx.db.get<{ id: string; user_id: string; expires_at: string; revoked_at: string | null; last_seen_at: string }>(
    'SELECT id, user_id, expires_at, revoked_at, last_seen_at FROM device_sessions WHERE token_hash = ?',
    sha256(token),
  );
  const now = ctx.now();
  if (!s || s.revoked_at || Date.parse(s.expires_at) < now.getTime()) throw unauthorized();
  const user = getUser(ctx, s.user_id);
  if (!user) throw unauthorized();
  // Sliding expiry, written at most once a minute.
  if (now.getTime() - Date.parse(s.last_seen_at) > 60_000) {
    ctx.db.run('UPDATE device_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString(), s.id);
  }
  return { user, sessionId: s.id };
}

export function revokeSession(ctx: AppContext, userId: string, sessionId: string): boolean {
  return ctx.db.run('UPDATE device_sessions SET revoked_at = ? WHERE user_id = ? AND id = ? AND revoked_at IS NULL', nowISO(ctx), userId, sessionId).changes > 0;
}

export function listSessions(ctx: AppContext, userId: string, currentId: string): DeviceSessionDTO[] {
  return ctx.db
    .all<{ id: string; device_name: string; platform: string; created_at: string; last_seen_at: string }>(
      'SELECT id, device_name, platform, created_at, last_seen_at FROM device_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC',
      userId,
      nowISO(ctx),
    )
    .map((r) => ({ id: r.id, deviceName: r.device_name, platform: r.platform, createdAt: r.created_at, lastSeenAt: r.last_seen_at, current: r.id === currentId }));
}
