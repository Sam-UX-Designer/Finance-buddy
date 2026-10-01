import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Field-level encryption (AES-256-GCM) for sensitive values at rest. */
export class Vault {
  private key: Buffer;
  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (base64)');
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
  }

  decrypt(token: string): string {
    const [v, iv, tag, data] = token.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Invalid ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptNullable(plain: string | null | undefined): string | null {
    return plain == null ? null : this.encrypt(plain);
  }

  decryptNullable(token: string | null | undefined): string | null {
    return token == null ? null : this.decrypt(token);
  }

  /** Keyed hash for looking up values (e.g. phone numbers) without storing them in plain text. */
  lookupHash(value: string): string {
    return createHmac('sha256', this.key).update(`lookup:${value}`).digest('hex');
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmacHex(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
