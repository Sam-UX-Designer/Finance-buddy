/** SMS delivery boundary. Production plugs in a licensed SMS/OTP provider behind this interface. */
export interface SmsProvider {
  readonly name: string;
  /** When set, the OTP to issue (development only). */
  readonly fixedCode: string | null;
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';
  constructor(
    readonly fixedCode: string | null,
    private log: (msg: string) => void,
  ) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.log(`[dev-sms] OTP for ${phoneE164.slice(0, 3)}******${phoneE164.slice(-4)}: ${code}`);
  }
}
