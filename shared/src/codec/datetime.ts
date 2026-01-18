/**
 * Datetime Codecs
 *
 * Reusable Zod schemas for ISO 8601 datetime string validation.
 * These codecs are used throughout the codebase for consistent date handling.
 *
 * IMPORTANT: All datetime strings MUST use canonical ISO 8601 format (UTC).
 * This format is produced by JavaScript's Date.prototype.toISOString() and
 * eliminates timezone ambiguity by always using UTC with 'Z' suffix.
 *
 * Canonical format: YYYY-MM-DDTHH:mm:ss.sssZ
 * Example: 2024-01-15T10:30:00.123Z
 *
 * Rejected formats:
 * - Timezone offsets (e.g., +08:00, -05:00)
 * - Missing milliseconds (e.g., 2024-01-15T10:30:00Z)
 * - Missing 'Z' suffix
 */

import { z } from 'zod';

/**
 * Regex pattern for canonical ISO 8601 datetime format.
 * Matches exactly what Date.prototype.toISOString() produces.
 *
 * Pattern breakdown:
 * - ^\d{4}-\d{2}-\d{2} - Date: YYYY-MM-DD
 * - T - Literal 'T' separator
 * - \d{2}:\d{2}:\d{2} - Time: HH:mm:ss
 * - \.\d{3} - Milliseconds: .sss (required)
 * - Z$ - UTC 'Z' suffix (required, no timezone offsets)
 */
const CANONICAL_ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Validates that a string matches the canonical ISO 8601 datetime format.
 *
 * This ensures:
 * 1. The string can be parsed as a valid date
 * 2. The format is exactly what toISOString() produces
 * 3. No timezone ambiguity (always UTC with 'Z')
 *
 * @param value - The datetime string to validate
 * @returns true if the value is a valid canonical ISO datetime
 */
const isValidIsoDateTime = (value: string): boolean => {
  // First check the format matches the canonical pattern
  if (!CANONICAL_ISO_DATETIME_REGEX.test(value)) {
    return false;
  }
  // Then verify it's a parseable date
  const date = new Date(value);
  return !isNaN(date.getTime());
};

/**
 * Zod schema for non-null ISO 8601 datetime strings.
 *
 * Enforces canonical format matching Date.prototype.toISOString().
 * This ensures timezone consistency across the entire application.
 *
 * @example
 * ```ts
 * zIsoDateTimeString.parse("2024-01-15T10:30:00.123Z"); // OK (canonical)
 * zIsoDateTimeString.parse("2024-01-15T10:30:00Z"); // Error (missing milliseconds)
 * zIsoDateTimeString.parse("2024-01-15T10:30:00+08:00"); // Error (timezone offset)
 * zIsoDateTimeString.parse("invalid"); // ZodError
 * ```
 */
export const zIsoDateTimeString = z
  .string({
    required_error: 'Datetime string is required',
    invalid_type_error: 'Datetime must be a string',
  })
  .refine(isValidIsoDateTime, {
    message:
      'Invalid datetime format. Expected canonical ISO 8601 format (e.g., 2024-01-15T10:30:00.123Z)',
  });

/**
 * Zod schema for nullable ISO 8601 datetime strings.
 *
 * Accepts null or a canonical ISO 8601 datetime string.
 * Uses the same strict validation as zIsoDateTimeString.
 *
 * @example
 * ```ts
 * zIsoDateTimeNullable.parse("2024-01-15T10:30:00.123Z"); // OK (canonical)
 * zIsoDateTimeNullable.parse(null); // OK
 * zIsoDateTimeNullable.parse(undefined); // OK (optional)
 * zIsoDateTimeNullable.parse("2024-01-15T10:30:00Z"); // Error (missing milliseconds)
 * zIsoDateTimeNullable.parse("2024-01-15T10:30:00+08:00"); // Error (timezone offset)
 * ```
 */
export const zIsoDateTimeNullable = z
  .string({
    required_error: 'Datetime string must be a string or null',
    invalid_type_error: 'Datetime must be a string or null',
  })
  .nullable()
  .refine((value) => value === null || isValidIsoDateTime(value), {
    message:
      'Invalid datetime format. Expected canonical ISO 8601 format (e.g., 2024-01-15T10:30:00.123Z) or null',
  });
