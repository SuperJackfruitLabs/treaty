/**
 * A subject's expiry, `subject.expires_at`: an RFC 3339 date-time with seconds and an explicit
 * offset, such as `2030-01-02T03:04:05Z` or `2030-01-02T08:34:05.5+05:30`.
 *
 * The one spelling every reader accepts. Looser ones that `Date.parse` happens to read (a date
 * only, `Jan 2 2030`, no seconds, no offset, a space for the `T`) are refused, because a strict
 * reader of the event would drop it, and two readers disagreeing on when an approval lapses is
 * worse than either refusing it. SuperPipeline sends only this form.
 *
 * The schemas (`subject.expires_at` in gate.v2, question.v2, delivery.v2, permission.v2) carry the
 * same rule as `"format": "date-time"` and as this pattern, because a JSON Schema validator need
 * not assert `format`.
 */

/** The pattern the schemas carry, as a JSON Schema `pattern` string. */
export const SUBJECT_EXPIRY_PATTERN =
  "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d+)?(Z|[+-]([01]\\d|2[0-3]):[0-5]\\d)$";

/** The schemas' `maxLength` on `expires_at`. */
export const SUBJECT_EXPIRY_MAX = 200;

const EXPIRY = new RegExp(SUBJECT_EXPIRY_PATTERN);

/** Is this an expiry in the one form a subject may carry, naming a real calendar day? */
export function isSubjectExpiry(v: unknown): v is string {
  if (typeof v !== "string" || v.length > SUBJECT_EXPIRY_MAX) return false;
  if (!EXPIRY.test(v)) return false;
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(5, 7));
  const day = Number(v.slice(8, 10));
  // 2030-02-30 matches the pattern; the calendar refuses it, as `format: date-time` does.
  return new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day;
}
