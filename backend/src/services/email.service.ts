import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface DeficientDocItem {
  name: string;
  remarks?: string;
}

export interface DeficiencyEmailOptions {
  recipientEmail: string;
  recipientName: string;
  transactionId: number;
  transactionType: string;
  aoRemarks?: string;
  deficientDocuments: DeficientDocItem[];
  magicToken: string;
}

let transporter: Transporter | null = null;

export interface TransactionalEmailOptions {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  heading: string;
  message: string;
  reference?: string;
  actionLabel?: string;
  actionUrl?: string;
  credentials?: {
    username: string;
    initialPassword: string;
  };
  /** The action link works as a credential (e.g. account setup); never kept after delivery. */
  sensitive?: boolean;
  /** A one-time code shown large (sign-in verification). */
  code?: string;
  /** Short facts shown as label/value rows, e.g. device and time. */
  details?: Array<{ label: string; value: string }>;
  /** Documents to act on, each with the reviewer note. */
  items?: Array<{ name: string; note?: string | null }>;
  itemsTitle?: string;
  /** Overrides the tone read from the wording. */
  tone?: EmailTone;
  /** Inbox preview line; defaults to the heading and message. */
  preheader?: string;
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

type EmailTone = 'action' | 'decision' | 'success' | 'security' | 'info';

/** The explicit tone wins; otherwise it is read from the wording. Security notices are checked first. */
const toneFor = (options: TransactionalEmailOptions): EmailTone => {
  if (options.tone) return options.tone;
  const copy = `${options.subject} ${options.heading}`.toLowerCase();
  if (/sign-in|signed in|password|device|confirm it is you|sign-in email|security/.test(copy)) return 'security';
  if (/rejected|disqualified|not approved|not selected/.test(copy)) return 'decision';
  if (/action required|correction|returned|deficien|escalat/.test(copy)) return 'action';
  if (/approved|ready|created|selected|submitted|recorded/.test(copy)) return 'success';
  return 'info';
};

// One palette for every Digital 201 email, matching the web portal.
const BRAND = { green: '#2F7D52', greenDark: '#1F5A3A', ink: '#1C2B22', text: '#3D4F44', muted: '#66776C', line: '#DCE6DE', page: '#F2F5F1', panel: '#F6F9F6' };
const toneTokens: Record<EmailTone, { bar: string; tint: string; ink: string; label: string }> = {
  action: { bar: '#C2410C', tint: '#FFF1E8', ink: '#8A3A0B', label: 'Action needed' },
  decision: { bar: '#9F1D2E', tint: '#FCECEE', ink: '#7D1726', label: 'Decision' },
  success: { bar: BRAND.green, tint: '#E9F5EE', ink: BRAND.greenDark, label: 'Confirmed' },
  security: { bar: '#8A621B', tint: '#FBF3E2', ink: '#6B4A12', label: 'Account security' },
  info: { bar: '#3D6E8F', tint: '#EAF2F7', ink: '#2C5470', label: 'Update' },
};

const plainTextFor = (options: TransactionalEmailOptions): string => [
  options.heading,
  '',
  `Dear ${options.recipientName},`,
  '',
  options.message,
  options.code ? `Your code: ${options.code}` : '',
  ...(options.details || []).map(d => `${d.label}: ${d.value}`),
  ...(options.items || []).map(i => `- ${i.name}${i.note ? `: ${i.note}` : ''}`),
  options.reference ? `Reference: ${options.reference}` : '',
  options.credentials ? `Username: ${options.credentials.username}` : '',
  options.credentials ? `Temporary password: ${options.credentials.initialPassword}` : '',
  options.credentials ? 'Change this password immediately after your first sign-in.' : '',
  options.actionUrl ? `${options.actionLabel || 'Open Digital 201'}: ${options.actionUrl}` : '',
  '',
  'Digital 201 | DepEd Schools Division of Koronadal City',
  'This is an automated notification. Do not reply with passwords or personnel documents.',
].filter(Boolean).join('\n');

const box = (inner: string, style = '') =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border:1px solid ${BRAND.line};border-radius:12px;background:${BRAND.panel};${style}"><tr><td style="padding:14px 16px;">${inner}</td></tr></table>`;
const label = (text: string) =>
  `<div style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:${BRAND.muted};">${text}</div>`;

/** Every Digital 201 email: one layout, readable on a phone, no images or scripts. */
export const renderTransactionalEmail = (options: TransactionalEmailOptions): string => {
  const tone = toneTokens[toneFor(options)];
  const safeHeading = escapeHtml(options.heading);
  // Line breaks in the message (e.g. a list of returned documents) survive in HTML.
  const safeMessage = escapeHtml(options.message).replace(/\n/g, '<br>');
  const safeName = escapeHtml(options.recipientName);
  const actionUrl = options.actionUrl ? escapeHtml(options.actionUrl) : '';
  const actionLabel = escapeHtml(options.actionLabel || 'Open Digital 201');
  const credentials = options.credentials;
  const preheader = options.preheader || `${options.heading}. ${options.message}`.slice(0, 140);

  const code = options.code
    ? box(`${label('Your code')}<div style="padding-top:6px;font-family:Consolas,'Courier New',monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:${BRAND.ink};">${escapeHtml(options.code)}</div>`, 'text-align:center;')
    : '';
  const details = options.details?.length
    ? box(options.details.map((d, i) => `<div style="${i ? `padding-top:10px;margin-top:10px;border-top:1px solid ${BRAND.line};` : ''}">${label(escapeHtml(d.label))}<div style="padding-top:3px;font-size:15px;line-height:22px;color:${BRAND.ink};word-break:break-word;">${escapeHtml(d.value)}</div></div>`).join(''))
    : '';
  const items = options.items?.length
    ? `<div style="margin-top:22px;">${label(escapeHtml(options.itemsTitle || 'Documents to fix'))}${options.items.map(i => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;border:1px solid ${BRAND.line};border-left:4px solid ${tone.bar};border-radius:10px;background:#FFFFFF;"><tr><td style="padding:12px 14px;"><div style="font-size:15px;line-height:21px;font-weight:700;color:${BRAND.ink};">${escapeHtml(i.name)}</div>${i.note ? `<div style="padding-top:4px;font-size:14px;line-height:21px;color:${tone.ink};">${escapeHtml(i.note)}</div>` : ''}</td></tr></table>`).join('')}</div>`
    : '';
  const reference = options.reference
    ? box(`${label('Reference')}<div style="padding-top:4px;font-family:Consolas,'Courier New',monospace;font-size:15px;line-height:21px;font-weight:700;color:${BRAND.ink};">${escapeHtml(options.reference)}</div>`)
    : '';
  const creds = credentials
    ? box(`${label('Your first sign-in')}
        <div style="padding-top:10px;font-size:13px;line-height:18px;color:${BRAND.muted};">Username</div>
        <div style="font-family:Consolas,'Courier New',monospace;font-size:15px;line-height:22px;font-weight:700;color:${BRAND.ink};word-break:break-all;">${escapeHtml(credentials.username)}</div>
        <div style="padding-top:8px;font-size:13px;line-height:18px;color:${BRAND.muted};">Temporary password</div>
        <div style="font-family:Consolas,'Courier New',monospace;font-size:15px;line-height:22px;font-weight:700;color:${BRAND.ink};word-break:break-all;">${escapeHtml(credentials.initialPassword)}</div>
        <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#FBF3E2;color:#6B4A12;font-size:13px;line-height:19px;">You will be asked to change this password when you first sign in. Do not forward this email.</div>`)
    : '';
  const button = actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;"><tr><td bgcolor="${BRAND.green}" style="border-radius:10px;"><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-size:16px;line-height:20px;font-weight:700;">${actionLabel}</a></td></tr></table>
       <p style="margin:14px 0 0;color:${BRAND.muted};font-size:13px;line-height:19px;word-break:break-all;">Button not working? Copy this address into your browser:<br><a href="${actionUrl}" style="color:${BRAND.greenDark};text-decoration:underline;">${actionUrl}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${safeHeading}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};color:${BRAND.text};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${BRAND.page};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 4px 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><div style="width:36px;height:36px;line-height:36px;text-align:center;border-radius:9px;background:${BRAND.green};color:#FFFFFF;font-size:13px;font-weight:800;">201</div></td>
            <td valign="middle" style="padding-left:10px;"><div style="font-size:16px;line-height:20px;font-weight:800;color:${BRAND.ink};">Digital 201</div><div style="font-size:12px;line-height:16px;color:${BRAND.muted};">DepEd Schools Division of Koronadal City</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid ${BRAND.line};border-top:4px solid ${tone.bar};border-radius:14px;padding:26px 26px 28px;">
          <div style="display:inline-block;padding:5px 10px;border-radius:999px;background:${tone.tint};color:${tone.ink};font-size:12px;line-height:16px;font-weight:700;">${tone.label}</div>
          <h1 style="margin:14px 0 0;color:${BRAND.ink};font-size:24px;line-height:31px;font-weight:800;">${safeHeading}</h1>
          <p style="margin:18px 0 0;color:${BRAND.ink};font-size:16px;line-height:24px;">Dear ${safeName},</p>
          <p style="margin:10px 0 0;color:${BRAND.text};font-size:16px;line-height:25px;">${safeMessage}</p>
          ${code}${details}${items}${reference}${creds}${button}
        </td></tr>
        <tr><td style="padding:18px 6px 0;">
          <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:19px;">You received this because you have a Digital 201 account. It was sent automatically; do not reply with passwords or personnel documents.</p>
          <p style="margin:8px 0 0;color:${BRAND.muted};font-size:13px;line-height:19px;">Digital 201 · DepEd Schools Division of Koronadal City</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;

  if (config.email.host && config.email.user && config.email.pass) {
    try {
      transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
        // Fail fast where the SMTP port is blocked instead of hanging for minutes.
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      });
      logger.info(`[EmailService] Configured SMTP transporter (${config.email.host}:${config.email.port})`);
    } catch (err) {
      logger.error({ err: err }, '[EmailService] Failed to initialize SMTP transporter');
      transporter = null;
    }
  }

  return transporter;
};

/**
 * Why a message was not delivered, recorded on the outbox row (lastError) so a
 * failing queue explains itself. Every email had been failing with only
 * "Email provider did not accept the message", which hid the actual cause.
 */
export class EmailDeliveryError extends Error {}

const NOT_CONFIGURED = 'Email is not configured on this server (set MAILTRAP_API_TOKEN, or SMTP_HOST, SMTP_USER and SMTP_PASS).';

type OutgoingMail = { to: string; subject: string; text: string; html: string };

/** "Name <addr>" or "addr" -> Mailtrap's { email, name }. */
const parseAddress = (value: string): { email: string; name?: string } => {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { email: match[2].trim(), ...(match[1].trim() ? { name: match[1].trim() } : {}) } : { email: value.trim() };
};

const sendViaMailtrapApi = async (mail: OutgoingMail): Promise<void> => {
  let response: Response;
  try {
    response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.mailtrapApiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: parseAddress(config.email.from),
        to: [{ email: mail.to }],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        category: 'Digital 201',
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error: any) {
    throw new EmailDeliveryError(`Mailtrap API request failed: ${error?.message || error}`.slice(0, 500));
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new EmailDeliveryError(`Mailtrap API rejected the message: ${response.status} ${body}`.slice(0, 500));
  }
};

/** Sends through the Mailtrap API when configured, otherwise SMTP. Throws EmailDeliveryError with the cause. */
const deliver = async (mail: OutgoingMail): Promise<void> => {
  if (config.email.mailtrapApiToken) {
    await sendViaMailtrapApi(mail);
    return;
  }
  const mailer = getTransporter();
  if (!mailer) throw new EmailDeliveryError(NOT_CONFIGURED);
  try {
    await mailer.sendMail({ from: config.email.from, ...mail });
  } catch (error) {
    throw new EmailDeliveryError(describeSmtpFailure(error));
  }
};

/** The SMTP server's own reason, e.g. "EAUTH 535 Invalid login" or "550 sender rejected". */
export const describeSmtpFailure = (error: any): string => {
  const parts = [error?.code, error?.responseCode, error?.response || error?.message].filter(Boolean);
  return `SMTP delivery failed: ${parts.join(' ') || 'unknown error'}`.slice(0, 500);
};

export const sendTransactionalEmail = async (options: TransactionalEmailOptions): Promise<boolean> => {
  try {
    await deliver({
      to: options.recipientEmail,
      subject: options.subject,
      text: plainTextFor(options),
      html: renderTransactionalEmail(options),
    });
    logger.info(`[EmailService] Transactional email sent to ${options.recipientEmail}: ${options.subject}`);
    return true;
  } catch (error) {
    logger.error({ err: error }, `[EmailService] Transactional email delivery failed: ${options.subject}`);
    throw error;
  }
};

export const sendDeficiencyAlertEmail = async (options: DeficiencyEmailOptions): Promise<boolean> => {
  const {
    recipientEmail,
    recipientName,
    transactionId,
    transactionType,
    aoRemarks,
    deficientDocuments,
    magicToken,
  } = options;

  const targetPath = `/personnel/checklist?txId=${transactionId}`;
  const magicLoginUrl = `${config.clientUrl}/auth/magic-login?token=${encodeURIComponent(magicToken)}&redirect=${encodeURIComponent(targetPath)}`;

  const subject = `Action needed: documents returned on TRX-${transactionId} (${transactionType})`;

  const htmlContent = renderTransactionalEmail({
    recipientEmail, recipientName, subject,
    heading: 'Documents returned for correction',
    message: `AO II reviewed ${transactionType} TRX-${transactionId} and returned the document${deficientDocuments.length === 1 ? '' : 's'} below. Replace only ${deficientDocuments.length === 1 ? 'this one' : 'these'}, then resubmit. Your other documents stay as they are.\n\nThe button below signs you in directly. It works once and expires in 48 hours.`,
    tone: 'action',
    items: deficientDocuments.length
      ? deficientDocuments.map(doc => ({ name: doc.name, note: doc.remarks || aoRemarks || null }))
      : [{ name: 'Returned documents', note: aoRemarks || 'Open the checklist to see what to fix.' }],
    itemsTitle: 'Documents to fix',
    details: aoRemarks && deficientDocuments.some(doc => doc.remarks) ? [{ label: 'AO II note', value: aoRemarks }] : undefined,
    reference: `TRX-${transactionId}`,
    actionLabel: 'Fix the documents',
    actionUrl: magicLoginUrl,
    preheader: `AO II returned ${deficientDocuments.length || 'some'} document${deficientDocuments.length === 1 ? '' : 's'} on TRX-${transactionId}. Replace only ${deficientDocuments.length === 1 ? 'that one' : 'those'}, then resubmit.`,
  });

  // Delivery metadata only. The magic login URL carries a working 48-hour
  // credential, so it is never written to logs — anyone with log access could
  // otherwise sign in as the recipient. The link goes to the recipient by email
  // and nowhere else.
  logger.info(
    {
      recipient: recipientEmail,
      transactionId,
      transactionType,
      deficiencyCount: deficientDocuments.length,
      magicLinkIssued: true,
    },
    '[EmailService] Deficiency notification prepared',
  );

  // 2. Delivery (Mailtrap API or SMTP)
  {
    try {
      await deliver({
        to: recipientEmail,
        subject,
        text: [
          'Document correction required',
          '',
          `Dear ${recipientName},`,
          `Your ${transactionType} transaction TRX-${transactionId} requires document corrections.`,
          aoRemarks ? `AO II remarks: ${aoRemarks}` : '',
          ...deficientDocuments.map(doc => `- ${doc.name}: ${doc.remarks || 'Revision required'}`),
          '',
          `Open Digital 201: ${magicLoginUrl}`,
        ].filter(Boolean).join('\n'),
        html: htmlContent,
      });
      logger.info(`[EmailService] Deficiency email dispatched to ${recipientEmail}`);
      return true;
    } catch (error) {
      logger.error({ err: error }, '[EmailService] Failed to send deficiency email');
      throw error;
    }
  }
};
