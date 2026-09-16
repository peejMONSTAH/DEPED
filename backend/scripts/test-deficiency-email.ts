import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { sendDeficiencyAlertEmail } from '../src/services/email.service';
import { generateMagicToken } from '../src/utils/jwt.util';
import { passwordTokenVersion } from '../src/utils/jwt.util';
import { config } from '../src/config';

const prisma = new PrismaClient();

async function runTest() {
  console.log('🔍 Searching for a personnel with user account and transaction in database...');

  // Find a personnel with linked user and transactions
  const personnel = await prisma.personnel.findFirst({
    include: {
      user: {
        include: { role: true },
      },
      transactions: {
        include: { transactionType: true },
      },
    },
  });

  if (!personnel || !personnel.user) {
    console.error('❌ No personnel with linked user account found in database.');
    return;
  }

  const user = personnel.user;
  const transaction = personnel.transactions[0];
  const txId = transaction ? transaction.id : 101;
  const txTypeName = transaction?.transactionType?.name || 'Step Increment (3-Year)';

  console.log(`\n📋 Target Personnel: ${personnel.firstName} ${personnel.lastName}`);
  console.log(`📧 Target Email:     ${user.email}`);
  console.log(`📑 Transaction:      TRX-${txId} (${txTypeName})`);

  // Generate genuine 1-Click Magic Token
  const magicToken = generateMagicToken({
    userId: user.id,
    email: user.email,
    role: user.role?.name || 'TEACHING_PERSONNEL',
    pwdv: passwordTokenVersion(user.passwordHash),
    txId,
  });

  const deficientDocuments = [
    {
      name: 'CS Form 212 (Personal Data Sheet - PDS)',
      remarks: 'Work Experience section missing DepEd Division stamp and signature on Page 4.',
    },
    {
      name: 'Latest Approved Appointment (CS Form 33)',
      remarks: 'Scanned image is blurry and illegible. Please provide a clear 300 DPI copy.',
    },
  ];

  console.log('\n🚀 Dispatching Deficiency Alert Email...');
  const delivered = await sendDeficiencyAlertEmail({
    recipientEmail: user.email,
    recipientName: `${personnel.firstName} ${personnel.lastName}`,
    transactionId: txId,
    transactionType: txTypeName,
    aoRemarks: 'Please re-upload the 2 flagged deficient documents within 5 working days to proceed with HRMO approval.',
    deficientDocuments,
    magicToken,
  });

  if (!delivered) {
    throw new Error('SMTP delivery failed. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in backend/.env.');
  }

  // Export HTML preview file so the user can open it in a browser directly
  const targetPath = `/personnel/checklist?txId=${txId}`;
  const magicLoginUrl = `${config.clientUrl}/auth/magic-login?token=${encodeURIComponent(magicToken)}&redirect=${encodeURIComponent(targetPath)}`;

  const previewHtmlPath = path.resolve(__dirname, '../deficiency_email_preview.html');
  
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DepEd SDO Koronadal - Deficiency Alert Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F1F5F9; padding: 30px; margin: 0; }
    .card { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #E2E8F0; }
    .header { background: linear-gradient(135deg, #0A192F 0%, #0F3460 100%); padding: 32px; text-align: center; border-bottom: 4px solid #F59E0B; color: #fff; }
    .header h2 { margin: 8px 0 0 0; color: #fff; font-size: 20px; }
    .content { padding: 32px; }
    .alert { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 14px; margin: 20px 0; color: #92400E; font-weight: 600; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th { background: #0F3460; color: #fff; text-align: left; padding: 10px 12px; }
    td { padding: 10px 12px; border-bottom: 1px solid #E2E8F0; }
    .btn { display: block; width: fit-content; margin: 24px auto; background: #2563EB; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; text-align: center; font-size: 15px; }
    .footer { background: #F8FAFC; padding: 20px; text-align: center; font-size: 11px; color: #64748B; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div style="color: #F59E0B; font-size: 11px; font-weight: 800; letter-spacing: 2px;">DEPARTMENT OF EDUCATION • SDO KORONADAL CITY</div>
      <h2>Action Required: Document Deficiency Notice</h2>
    </div>
    <div class="content">
      <p>Dear <strong>${personnel.firstName} ${personnel.lastName}</strong>,</p>
      <p>Your 201 transaction dossier for <strong>${txTypeName}</strong> (Reference: <code>TRX-${txId}</code>) was evaluated by the Administrative Officer II (AO II).</p>
      <div class="alert">
        ⚠️ AO II Finding / Remarks:<br>
        <span style="font-weight: normal; margin-top: 4px; display: inline-block;">"Please re-upload the 2 flagged deficient documents within 5 working days to proceed with HRMO approval."</span>
      </div>
      <h3>Deficient Documents Requiring Compliance:</h3>
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Status</th>
            <th>Required Revision</th>
          </tr>
        </thead>
        <tbody>
          ${deficientDocuments.map(d => `
            <tr>
              <td><strong>${d.name}</strong></td>
              <td style="color: #DC2626; font-weight: bold;">Deficient / Re-upload</td>
              <td>${d.remarks}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="font-size: 13px; color: #475569;">You only need to re-upload the deficient documents above. All previously verified documents remain intact in your 201 File.</p>
      <a href="${magicLoginUrl}" class="btn">🚀 1-Click Magic Login & Re-upload Documents →</a>
      <p style="font-size: 11px; color: #94A3B8; text-align: center;">This magic login link is valid for 48 hours and securely authenticates directly to your transaction checklist.</p>
    </div>
    <div class="footer">
      Republic of the Philippines • Department of Education<br>
      Schools Division of Koronadal City • Eminence Digital 201 System
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(previewHtmlPath, sampleHtml, 'utf-8');

  console.log(`\n📄 Created HTML Email preview at: ${previewHtmlPath}`);
  console.log(`💡 You can open this file in any web browser to see the exact email personnel receive!`);
}

runTest()
  .catch((err) => {
    console.error('❌ Test failed:', err);
  })
  .finally(() => prisma.$disconnect());
