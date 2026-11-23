export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly replyTo?: string;
  readonly tags?: Readonly<Record<string, string>>;
  readonly templateId?: 'password-reset' | 'welcome' | string;
}

export interface EmailDeliveryResult {
  readonly status: 'sent' | 'skipped';
}

/** Stable port. `auth` depends on this interface, never on a concrete provider. */
export interface EmailProvider {
  readonly id: 'console' | string;
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
  health?(): Promise<{ readonly status: 'ok' | 'error' }>;
  close?(): Promise<void>;
}

type LogLine = (line: string) => void;

/**
 * Development-only adapter. It logs recipient, template id, and status only;
 * bodies, reset links, and tokens are never written to logs.
 */
export function createConsoleEmailProvider(log: LogLine = console.info): EmailProvider {
  return {
    id: 'console',
    async send(message) {
      log(
        `email provider=console template=${message.templateId ?? 'none'} to=${message.to} status=sent`,
      );
      return { status: 'sent' };
    },
    async health() {
      return { status: 'ok' };
    },
  };
}

export interface CapturedEmailMessage extends EmailMessage {
  readonly sentAt: Date;
}

/** Test-only provider that captures messages in memory instead of printing them. */
export function createInMemoryEmailProvider(): EmailProvider & {
  readonly messages: readonly CapturedEmailMessage[];
} {
  const messages: CapturedEmailMessage[] = [];
  return {
    id: 'memory',
    messages,
    async send(message) {
      messages.push({ ...message, sentAt: new Date() });
      return { status: 'sent' };
    },
  };
}
