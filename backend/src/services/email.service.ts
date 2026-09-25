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
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

type EmailTone = 'success' | 'warning' | 'danger' | 'info';

const toneFor = (options: TransactionalEmailOptions): EmailTone => {
  const copy = `${options.subject} ${options.heading} ${options.message}`.toLowerCase();
  if (/rejected|disqualified|not approved|deficien/.test(copy)) return 'danger';
  if (/action required|correction|returned|escalat/.test(copy)) return 'warning';
  if (/approved|ready|created|selected|success/.test(copy)) return 'success';
  return 'info';
};

const toneTokens: Record<EmailTone, { accent: string; tint: string; ink: string; label: string }> = {
  success: { accent: '#18864B', tint: '#EAF7EF', ink: '#116138', label: 'Confirmed' },
  warning: { accent: '#C47610', tint: '#FFF6E5', ink: '#8A4D08', label: 'Needs attention' },
  danger: { accent: '#C63D3D', tint: '#FFF0F0', ink: '#8F2929', label: 'Decision issued' },
  info: { accent: '#286D9E', tint: '#EDF6FC', ink: '#1E557A', label: 'Update' },
};

const plainTextFor = (options: TransactionalEmailOptions): string => [
  options.heading,
  '',
  `Dear ${options.recipientName},`,
  '',
  options.message,
  options.reference ? `Reference: ${options.reference}` : '',
  options.credentials ? `Username: ${options.credentials.username}` : '',
  options.credentials ? `Temporary password: ${options.credentials.initialPassword}` : '',
  options.credentials ? 'Change this password immediately after your first sign-in.' : '',
  options.actionUrl ? `${options.actionLabel || 'Open Digital 201'}: ${options.actionUrl}` : '',
  '',
  'Digital 201 | DepEd Schools Division of Koronadal City',
  'This is an automated notification. Do not reply with passwords or personnel documents.',
].filter(Boolean).join('\n');

const renderTransactionalEmail = (options: TransactionalEmailOptions): string => {
  const tone = toneTokens[toneFor(options)];
  const safeHeading = escapeHtml(options.heading);
  // Line breaks in the message (e.g. a list of returned documents) survive in HTML.
  const safeMessage = escapeHtml(options.message).replace(/\n/g, '<br>');
  const safeName = escapeHtml(options.recipientName);
  const reference = options.reference ? escapeHtml(options.reference) : '';
  const actionUrl = options.actionUrl ? escapeHtml(options.actionUrl) : '';
  const actionLabel = escapeHtml(options.actionLabel || 'Open Digital 201');
  const credentials = options.credentials;
  const preheader = `${options.heading}. ${options.message}`.slice(0, 145);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeHeading}</title></head>
<body style="margin:0;padding:0;background:#EEF2F5;color:#1B2B3A;font-family:Arial,'Helvetica Neue',sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#EEF2F5;">
    <tr><td align="center" style="padding:36px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#FFFFFF;border:1px solid #D7E0E7;border-radius:16px;overflow:hidden;">
        <tr><td style="height:6px;background:${tone.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 30px;background:#12283D;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="52" valign="middle"><div style="width:44px;height:44px;line-height:44px;text-align:center;border-radius:10px;background:#C7F13A;color:#10263A;font-size:14px;font-weight:800;letter-spacing:-.3px;">201</div></td>
            <td valign="middle" style="padding-left:12px;"><div style="font-size:18px;line-height:22px;font-weight:800;color:#FFFFFF;">Digital 201</div><div style="padding-top:3px;font-size:11px;line-height:15px;color:#B7C5D1;">Personnel Records Management System</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:30px 30px 10px;">
          <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:${tone.tint};color:${tone.ink};font-size:11px;line-height:14px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">${tone.label}</div>
          <h1 style="margin:15px 0 0;color:#14283D;font-size:25px;line-height:32px;font-weight:800;letter-spacing:-.4px;">${safeHeading}</h1>
        </td></tr>
        <tr><td style="padding:14px 30px 30px;">
          <p style="margin:0 0 16px;color:#263B4D;font-size:15px;line-height:24px;">Dear <strong>${safeName}</strong>,</p>
          <p style="margin:0;color:#536779;font-size:15px;line-height:25px;">${safeMessage}</p>
          ${reference ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;background:#F5F8FA;border:1px solid #DCE4EA;border-radius:10px;"><tr><td style="padding:14px 16px;"><div style="font-size:11px;line-height:14px;color:#718292;text-transform:uppercase;letter-spacing:.7px;font-weight:700;">Reference</div><div style="padding-top:5px;color:#17324D;font-family:Consolas,'Courier New',monospace;font-size:14px;line-height:20px;font-weight:700;">${reference}</div></td></tr></table>` : ''}
          ${credentials ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;background:#F5F8FA;border:1px solid #D6E0E7;border-radius:10px;">
            <tr><td colspan="2" style="padding:14px 16px 8px;color:#17324D;font-size:12px;line-height:16px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;">Initial login credentials</td></tr>
            <tr><td style="padding:8px 16px;width:34%;color:#6A7C8B;font-size:12px;line-height:18px;">Username</td><td style="padding:8px 16px;color:#14283D;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:18px;font-weight:700;word-break:break-all;">${escapeHtml(credentials.username)}</td></tr>
            <tr><td style="padding:8px 16px 14px;color:#6A7C8B;font-size:12px;line-height:18px;">Temporary password</td><td style="padding:8px 16px 14px;color:#14283D;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:18px;font-weight:700;word-break:break-all;">${escapeHtml(credentials.initialPassword)}</td></tr>
            <tr><td colspan="2" style="padding:12px 16px;background:#FFF6E5;border-top:1px solid #E9D9B8;color:#80500D;font-size:11px;line-height:17px;">For your security, change this password immediately after your first sign-in. Do not forward this email.</td></tr>
          </table>` : ''}
          ${actionUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td bgcolor="#17324D" style="border-radius:9px;"><a href="${actionUrl}" target="_blank" style="display:inline-block;padding:13px 22px;color:#FFFFFF;text-decoration:none;font-size:14px;line-height:18px;font-weight:700;white-space:nowrap;">${actionLabel}</a></td></tr></table><p style="margin:15px 0 0;color:#82909D;font-size:11px;line-height:17px;word-break:break-all;">If the button does not open, copy this address into your browser:<br><a href="${actionUrl}" style="color:#286D9E;text-decoration:underline;">${actionUrl}</a></p>` : ''}
        </td></tr>
        <tr><td style="padding:20px 30px;background:#F5F8FA;border-top:1px solid #DCE4EA;">
          <p style="margin:0;color:#506476;font-size:12px;line-height:18px;font-weight:700;">DepEd Schools Division of Koronadal City</p>
          <p style="margin:5px 0 0;color:#8493A0;font-size:11px;line-height:17px;">This automated notice was generated by Digital 201. Do not reply with passwords or personnel documents.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#8795A1;font-size:10px;line-height:15px;">Official personnel transaction notification</p>
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

  const subject = `Action Required: Document Deficiency for TRX-${transactionId} (${transactionType}) - DepEd SDO Koronadal`;

  const docListRows = deficientDocuments.length > 0
    ? deficientDocuments
        .map(
          (doc, i) => `
          <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #1E293B;">${escapeHtml(doc.name)}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #DC2626; font-weight: 700;">Action Required / Deficient</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #475569;">${escapeHtml(doc.remarks || aoRemarks || 'Document returned for revision.')}</td>
          </tr>`
        )
        .join('')
    : `
      <tr>
        <td colspan="3" style="padding: 16px; font-size: 14px; color: #64748B; text-align: center;">
          Document checklist returned for compliance revision.
        </td>
      </tr>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 640px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0A192F 0%, #0F3460 100%); padding: 32px 32px 28px 32px; text-align: center; border-bottom: 4px solid #F59E0B;">
              <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #F59E0B; text-transform: uppercase; margin-bottom: 6px;">
                Department of Education • SDO Koronadal City
              </div>
              <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 800; margin: 0 0 4px 0; letter-spacing: -0.5px;">
                Digital 201 Personnel Records System
              </h1>
              <p style="color: #94A3B8; font-size: 13px; margin: 0;">
                Personnel Document Validation & Compliance Advisory
              </p>
            </td>
          </tr>

          <!-- Notice Alert Header -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 14px 18px;">
                <div style="font-size: 14px; font-weight: 700; color: #991B1B; margin-bottom: 2px;">
                  ⚠️ Compliance Action Required: Deficient Document(s)
                </div>
                <div style="font-size: 13px; color: #B91C1C; line-height: 1.5;">
                  Your submission was reviewed by the Administrative Officer (AO II). One or more documents require revision or re-upload before approval.
                </div>
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="font-size: 15px; color: #1E293B; margin: 0 0 16px 0;">
                Dear <strong>${escapeHtml(recipientName)}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                This is an official automated advisory regarding your personnel transaction 
                <strong style="color: #0F172A;">TRX-${transactionId}</strong> (<em>${escapeHtml(transactionType)}</em>).
                Please inspect the feedback below and re-upload only the deficient items.
              </p>

              <!-- Transaction Summary Card -->
              <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; width: 40%; font-size: 13px; font-weight: 600; color: #64748B;">Transaction Ref:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0F172A;">TRX-${transactionId}</td>
                </tr>
                <tr style="border-top: 1px solid #E2E8F0;">
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #64748B;">Transaction Type:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #0F172A;">${escapeHtml(transactionType)}</td>
                </tr>
                ${aoRemarks ? `
                <tr style="border-top: 1px solid #E2E8F0;">
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #64748B;">AO II Evaluator Remarks:</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0F172A; font-weight: 500;">${escapeHtml(aoRemarks)}</td>
                </tr>` : ''}
              </table>

              <!-- Deficient Items Table -->
              <div style="margin-bottom: 24px;">
                <div style="font-size: 13px; font-weight: 700; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                  Documents Requiring Revision:
                </div>
                <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #CBD5E1; border-radius: 8px; overflow: hidden;">
                  <thead>
                    <tr style="background-color: #F1F5F9; border-bottom: 2px solid #CBD5E1; text-align: left;">
                      <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Document Name</th>
                      <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Status</th>
                      <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Feedback / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${docListRows}
                  </tbody>
                </table>
              </div>

              <!-- 1-Click Magic Login Action CTA -->
              <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border: 1.5px solid #93C5FD; border-radius: 12px; padding: 24px; text-align: center; margin: 28px 0;">
                <div style="font-size: 15px; font-weight: 700; color: #1E40AF; margin-bottom: 6px;">
                  Instant 1-Click Secure Access
                </div>
                <p style="font-size: 13px; color: #3B82F6; margin: 0 0 16px 0;">
                  Click the button below to sign in instantly and jump directly to your document upload screen:
                </p>
                <div>
                  <a href="${magicLoginUrl}" target="_blank" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4); border: 1px solid #1D4ED8;">
                    Submit Deficient Documents →
                  </a>
                </div>
                <div style="font-size: 11px; color: #64748B; margin-top: 12px;">
                  🔒 Secured link expires in 48 hours • Single-session authentication token
                </div>
              </div>

              <!-- Fallback Direct URL -->
              <p style="font-size: 12px; color: #94A3B8; line-height: 1.5; word-break: break-all;">
                If the button above does not open, copy and paste this link into your browser:<br>
                <a href="${magicLoginUrl}" style="color: #2563EB; text-decoration: underline;">${magicLoginUrl}</a>
              </p>
            </td>
          </tr>

          <!-- DepEd Official Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="font-size: 12px; font-weight: 700; color: #475569; margin: 0 0 4px 0;">
                Republic of the Philippines • Department of Education
              </p>
              <p style="font-size: 11px; color: #64748B; margin: 0 0 12px 0;">
                Schools Division of Koronadal City • Digital 201 Automated Notification System
              </p>
              <p style="font-size: 11px; color: #94A3B8; margin: 0;">
                This is a system-generated advisory. Please do not reply directly to this email address.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
