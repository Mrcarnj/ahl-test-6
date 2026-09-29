// src/lib/saveContact.ts
//
// Native implementation: write straight into the device address book. See
// saveContact.web.ts, which downloads a .vcf file instead.

import * as Contacts from 'expo-contacts';

export type OfficialContact = {
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  email?: string | null;
  /** Raw base64 JPEG (no data: prefix), as returned by fetchImageBase64. */
  photoBase64?: string | null;
};

export type SaveContactResult = {
  ok: boolean;
  title: string;
  message: string;
};

export async function saveContact(
  official: OfficialContact,
  ensurePermission: () => Promise<boolean>,
): Promise<SaveContactResult> {
  try {
    const granted = await ensurePermission();
    if (!granted) {
      return {
        ok: false,
        title: 'Permission Required',
        message: 'This app needs permission to add contacts.',
      };
    }

    const contact: Contacts.Contact = {
      firstName: official.firstName,
      lastName: official.lastName,
      phoneNumbers: [
        {
          label: Contacts.Fields.PhoneNumbers,
          number: official.phoneNumber ?? undefined,
        },
      ],
      emails: [
        {
          label: Contacts.Fields.Emails,
          email: official.email ?? undefined,
        },
      ],
      company: 'AHL Officials',
      jobTitle: 'Official',
      contactType: Contacts.ContactTypes.Person,
      name: `${official.firstName} ${official.lastName}`,
    };

    if (official.photoBase64) {
      contact.imageAvailable = true;
      contact.image = { uri: `data:image/jpeg;base64,${official.photoBase64}` };
    }

    const result = await Contacts.addContactAsync(contact);
    if (!result) throw new Error('Failed to add contact');

    return {
      ok: true,
      title: 'Success',
      message: 'Contact was successfully added to your contacts!',
    };
  } catch (error) {
    console.error('Error adding contact:', error);
    return {
      ok: false,
      title: 'Error',
      message: 'Unable to add contact. Please try again.',
    };
  }
}
