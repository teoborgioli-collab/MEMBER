import { z } from 'zod';

const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), 'Ungültige Zeichen im Namen.');

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
    firstName: name,
    lastName: name,
    birthDate: z.string().refine(validDate),
    email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
    privacyRead: z.literal('on'),
    accuracyConfirmed: z.literal('on'),
    statutesAccepted: z.literal('on').optional(),
    website: z.string().max(0).optional(),
    /** Fingerprint of the acknowledgement texts shown to the visitor (see lib/settings.ts). */
    consent: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .refine((v) => v.kind === 'existing' || v.statutesAccepted === 'on');

export const actionSchema = z.object({
  action: z.enum(['approve', 'review', 'reject', 'sent', 'delete']),
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
  status: Status;
  document_version: string;
  statutes_url: string;
  privacy_url: string;
  /** The exact acknowledgement texts the person confirmed. */
  acknowledgements: string[];
  created_at: string;
  decided_at: string | null;
  sent_at: string | null;
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
