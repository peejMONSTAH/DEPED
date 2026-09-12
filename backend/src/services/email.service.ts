import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

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

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;

  if (config.email.host && config.email.user) {
    try {
      transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      });
      console.log(`[EmailService] Configured SMTP transporter (${config.email.host}:${config.email.port})`);
    } catch (err) {
      console.error('[EmailService] Failed to initialize SMTP transporter:', err);
      transporter = null;
    }
  }

  return transporter;
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
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #1E293B;">${doc.name}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #DC2626; font-weight: 700;">Action Required / Deficient</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #475569;">${doc.remarks || aoRemarks || 'Document returned for revision.'}</td>
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
                Eminence Human Resource Information System
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
                Dear <strong>${recipientName}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                This is an official automated advisory regarding your personnel transaction 
                <strong style="color: #0F172A;">TRX-${transactionId}</strong> (<em>${transactionType}</em>). 
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
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #0F172A;">${transactionType}</td>
                </tr>
                ${aoRemarks ? `
                <tr style="border-top: 1px solid #E2E8F0;">
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #64748B;">AO II Evaluator Remarks:</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0F172A; font-weight: 500;">${aoRemarks}</td>
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
                Schools Division of Koronadal City • Eminence HRIS Automated Notification System
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

  // 1. Console Simulation Banner (Always visible in dev/test)
  console.log('\n' + '='.repeat(80));
  console.log('✉️  [EMINENCE HRIS] DEFICIENCY NOTIFICATION EMAIL TRIGGERED');
  console.log('='.repeat(80));
  console.log(`To:            ${recipientName} <${recipientEmail}>`);
  console.log(`Subject:       ${subject}`);
  console.log(`Transaction:   TRX-${transactionId} (${transactionType})`);
  console.log(`AO Remarks:    ${aoRemarks || '(None specified)'}`);
  console.log(`Deficiencies:  ${deficientDocuments.map(d => d.name).join(', ') || 'General documentation'}`);
  console.log(`\n🔗 1-CLICK MAGIC LOGIN LINK (Valid 48h):`);
  console.log(`   ${magicLoginUrl}`);
  console.log('='.repeat(80) + '\n');

  // 2. SMTP Delivery if configured
  const mailer = getTransporter();
  if (mailer) {
    try {
      await mailer.sendMail({
        from: config.email.from,
        to: recipientEmail,
        subject,
        html: htmlContent,
      });
      console.log(`[EmailService] Deficiency email successfully dispatched via SMTP to ${recipientEmail}`);
      return true;
    } catch (smtpErr) {
      console.error('[EmailService] Failed to send email via SMTP, logged to console fallback:', smtpErr);
      return false;
    }
  }

  return true;
};
