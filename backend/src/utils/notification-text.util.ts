/**
 * Notification text is plain language; meaning comes from the client's icon
 * for the notification type. Rows written before emoji were removed from the
 * message templates still hold them, so messages are cleaned when served.
 * Removes pictographs with their variation selectors and joiners, then
 * collapses the spacing they leave behind.
 */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

export const plainNotificationText = (message: string): string =>
  message.replace(PICTOGRAPHS, '').replace(/[ \t]{2,}/g, ' ').trim();
