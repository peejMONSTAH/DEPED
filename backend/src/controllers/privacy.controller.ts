import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendBadRequest } from '../utils/response.util';
import { PRIVACY_NOTICE_VERSION } from '../utils/privacy-notice.util';

/** GET /auth/privacy-consent: has this person accepted the current Privacy Notice? */
export const getPrivacyConsent = async (req: Request, res: Response): Promise<void> => {
  const consent = await prisma.privacyConsent.findUnique({
    where: { userId_noticeVersion: { userId: req.user!.userId, noticeVersion: PRIVACY_NOTICE_VERSION } },
  });
  sendSuccess(res, { version: PRIVACY_NOTICE_VERSION, accepted: Boolean(consent), acceptedAt: consent?.acceptedAt ?? null });
};

/** POST /auth/privacy-consent: record that this person read the current notice. */
export const acceptPrivacyConsent = async (req: Request, res: Response): Promise<void> => {
  if (req.body?.version !== PRIVACY_NOTICE_VERSION) {
    sendBadRequest(res, 'The Privacy Notice was updated. Reload the page and read the current version.', 'PRIVACY_NOTICE_OUTDATED');
    return;
  }
  const userId = req.user!.userId;
  const where = { userId_noticeVersion: { userId, noticeVersion: PRIVACY_NOTICE_VERSION } };
  const existing = await prisma.privacyConsent.findUnique({ where });
  if (!existing) {
    await prisma.$transaction([
      prisma.privacyConsent.create({
        data: { userId, noticeVersion: PRIVACY_NOTICE_VERSION, ipAddress: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) || null },
      }),
      prisma.validationLog.create({
        data: { entityType: 'User', entityId: userId, action: 'PRIVACY_NOTICE_ACCEPTED', detailsJson: { version: PRIVACY_NOTICE_VERSION }, userId, ipAddress: req.ip, status: 'SUCCESS' },
      }),
    ]);
    res.locals.auditLogged = true;
  }
  sendSuccess(res, { version: PRIVACY_NOTICE_VERSION, accepted: true }, 'Privacy Notice accepted.');
};
