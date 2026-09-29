// src/lib/saveContact.web.ts
//
// Browser implementation: a page cannot write to the user's address book, so
// hand them a vCard download instead. macOS, iOS, Windows and Android all open
// .vcf into their contacts app, so the end result is the same.

import type { OfficialContact, SaveContactResult } from './saveContact';

export type { OfficialContact, SaveContactResult };

/**
 * vCard is a line-based format: literal commas, semicolons, backslashes and
 * newlines inside a value have to be escaped or they terminate the field.
 */
function escapeValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\;');
}

function buildVCard(official: OfficialContact): string {
  const { firstName, lastName, phoneNumber, email, photoBase64 } = official;

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeValue(lastName)};${escapeValue(firstName)};;;`,
    `FN:${escapeValue(`${firstName} ${lastName}`)}`,
    'ORG:AHL Officials',
    'TITLE:Official',
  ];

  if (phoneNumber) lines.push(`TEL;TYPE=CELL:${escapeValue(phoneNumber)}`);
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeValue(email)}`);
  if (photoBase64) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photoBase64}`);

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export async function saveContact(
  official: OfficialContact,
  _ensurePermission: () => Promise<boolean>,
): Promise<SaveContactResult> {
  try {
    const blob = new Blob([buildVCard(official)], {
      type: 'text/vcard;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${official.firstName}-${official.lastName}.vcf`.replace(/\s+/g, '');
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return {
      ok: true,
      title: 'Contact Downloaded',
      message: 'Open the downloaded .vcf file to add this official to your contacts.',
    };
  } catch (error) {
    console.error('Error creating contact card:', error);
    return {
      ok: false,
      title: 'Error',
      message: 'Unable to create the contact card. Please try again.',
    };
  }
}
