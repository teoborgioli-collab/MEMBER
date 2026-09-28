import { z } from 'zod';

const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), 'Ungültige Zeichen im Namen.');

/** Digits with optional +, spaces, brackets, slashes, dots or dashes; 6–20 digits. */
export function validPhone(value: string) {
  const digits = value.replace(/\D/g, '').length;
  return /^\+?[0-9(][0-9 ()\/.-]*$/.test(value) && digits >= 6 && digits <= 20;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

export const submissionSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['new', 'existing']),
    locale: z.enum(['de','en']).default('de'),
    firstName: name,
    lastName: name,
    birthDate: z.string().refine(validDate),
    email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
    phone: z.string().trim().max(30).refine(validPhone),
    room: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v)),
    membershipStartMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    /** Answers to the additional questions, checked in lib/settings.ts#checkAnswers. */
    answers: z
      .record(z.string().max(40), z.union([z.string().max(2000), z.boolean()]))
      .refine((v) => Object.keys(v).length <= 30)
      .optional(),
    privacyRead: z.literal('on'),
    accuracyConfirmed: z.literal('on'),
    statutesAccepted: z.literal('on').optional(),
    website: z.string().max(0).optional(),
    /** Fingerprint of the acknowledgement texts shown to the visitor (see lib/settings.ts). */
    consent: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .refine((v) => v.kind === 'existing' || v.statutesAccepted === 'on')
  .refine((v) => v.kind !== 'existing' || Boolean(v.membershipStartMonth), { message: 'Eintrittsmonat erforderlich.' });

export const actionSchema = z.object({
  action: z.enum(['approve', 'review', 'reject', 'sent', 'delete', 'mails', 'send_approval']),
  confirm: z.string().optional(),
});

export const STATUSES = ['pending', 'approved', 'reviewed', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export type Submission = {
  id: string;
  kind: 'new' | 'existing';
  first_name: string;
  last_name: string;
  /** YYYY-MM-DD */
  birth_date: string;
  email: string;
  /** Empty for submissions made before these fields were introduced. */
  phone: string | null;
  room: string | null;
  /** YYYY-MM for existing members, otherwise null. */
  membership_start_month: string | null;
  locale: 'de' | 'en';
  /** Answers to additional questions, with the question text at the time of submission. */
  answers: { id: string; question: string; answer: string }[];
  status: Status;
  document_version: string;
  statutes_url: string;
  privacy_url: string;
  /** The exact acknowledgement texts the person confirmed. */
  acknowledgements: string[];
  created_at: string;
  decided_at: string | null;
  sent_at: string | null;
  /** Automatic e-mails (see lib/notify.ts). */
  club_notified_at: string | null;
  confirmation_sent_at: string | null;
  mail_error: string | null;
  approval_mail_error: string | null;
};

export function canTransition(kind: string, status: string, action: string) {
  return (
    (status === 'pending' &&
      (action === 'reject' ||
        (kind === 'new' && action === 'approve') ||
        (kind === 'existing' && action === 'review'))) ||
    (kind === 'new' && status === 'approved' && action === 'sent')
  );
}
