import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import {
  DeficiencyEmailOptions,
  TransactionalEmailOptions,
  sendDeficiencyAlertEmail,
  sendTransactionalEmail,
} from './email.service';

type OutboxClient = {
  workflowOutbox: {
    upsert: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
};

const model = (client: unknown = prisma): OutboxClient['workflowOutbox'] =>
  (client as OutboxClient).workflowOutbox;

export async function queueTransactionalEmail(
  eventKey: string,
  payload: TransactionalEmailOptions,
  client: unknown = prisma,
): Promise<void> {
  await model(client).upsert({
    where: { eventKey },
    create: { eventKey, kind: 'TRANSACTIONAL_EMAIL', payload },
    update: {},
  });
}

export async function queueDeficiencyEmail(
  eventKey: string,
  payload: DeficiencyEmailOptions,
  client: unknown = prisma,
): Promise<void> {
  await model(client).upsert({
    where: { eventKey },
    create: { eventKey, kind: 'DEFICIENCY_EMAIL', payload },
    update: {},
  });
}

const MAX_ATTEMPTS = 8;

/**
 * Whether this process may deliver queued email. Default: production only.
 * A developer's backend pointed at a shared database would otherwise send the
 * live queue with local settings (localhost links) and burn its retries.
 * WORKFLOW_OUTBOX_ENABLED=true or =false overrides the default either way.
 */
export const isOutboxDeliveryEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  if (env.WORKFLOW_OUTBOX_ENABLED === 'true') return true;
  if (env.WORKFLOW_OUTBOX_ENABLED === 'false') return false;
  return env.NODE_ENV === 'production';
};

let processing = false;

export async function processWorkflowOutbox(): Promise<void> {
  // Queued rows are kept; they are delivered by a process that is allowed to.
  if (!isOutboxDeliveryEnabled()) return;
  if (processing) return;
  processing = true;
  try {
    const pending = await model().findMany({
      where: { processedAt: null, availableAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const item of pending) {
      const claim = await model().updateMany({
        where: { id: item.id, processedAt: null, attempts: item.attempts, availableAt: { lte: new Date() } },
        data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 5 * 60_000) },
      });
      if (claim.count !== 1) continue;
      try {
        const delivered = item.kind === 'DEFICIENCY_EMAIL'
          ? await sendDeficiencyAlertEmail(item.payload as unknown as DeficiencyEmailOptions)
          : await sendTransactionalEmail(item.payload as unknown as TransactionalEmailOptions);
        if (!delivered) throw new Error('Email provider did not accept the message.');
        const containsCredentials = Boolean((item.payload as any)?.credentials);
        await model().update({
          where: { id: item.id },
          data: {
            processedAt: new Date(),
            lastError: null,
            ...(containsCredentials ? { payload: { redacted: true, deliveredAt: new Date().toISOString() } } : {}),
          },
        });
      } catch (error: any) {
        const attempts = item.attempts + 1;
        const retryMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
        // MAX_ATTEMPTS is the point the poller stops selecting this row, so a
        // credential payload that is not scrubbed here stays in the database —
        // and in every backup — indefinitely. Redact on the terminal failure.
        const exhausted = attempts >= MAX_ATTEMPTS;
        const holdsCredentials = Boolean((item.payload as any)?.credentials);
        await model().update({
          where: { id: item.id },
          data: {
            lastError: String(error?.message || error).slice(0, 1000),
            availableAt: new Date(Date.now() + retryMinutes * 60_000),
            ...(exhausted && holdsCredentials
              ? { payload: { redacted: true, undeliverable: true, redactedAt: new Date().toISOString() } }
              : {}),
          },
        });
        if (exhausted) {
          logger.error(
            { eventKey: item.eventKey, attempts, credentialsRedacted: holdsCredentials },
            'Workflow email permanently failed; no further attempts will be made',
          );
        } else {
          logger.warn({ eventKey: item.eventKey, attempts }, 'Workflow email deferred for retry');
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Workflow outbox processing failed');
  } finally {
    processing = false;
  }
}

export function startWorkflowOutboxWorker(): NodeJS.Timeout {
  void processWorkflowOutbox();
  const timer = setInterval(() => void processWorkflowOutbox(), 30_000);
  timer.unref();
  return timer;
}
