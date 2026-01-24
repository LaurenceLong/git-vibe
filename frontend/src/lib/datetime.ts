/**
 * Centralized datetime helper functions for the frontend.
 * All dates are expected in ISO 8601 string format (as used by the shared package).
 */

/**
 * Default date format options for date-time display.
 */
const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/**
 * Default date format options for date-only display.
 */
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
};

/**
 * Placeholder text for null/undefined dates.
 */
const NULL_DATE_PLACEHOLDER = '—';

/**
 * Formats a date for display with both date and time components including seconds.
 *
 * @param date - The date to format (ISO string, Date object, or null/undefined)
 * @param options - Optional Intl.DateTimeFormatOptions to customize the format
 * @returns Formatted date string with seconds (mm:ss), or placeholder if date is null/undefined
 *
 * @example
 * formatDateTime('2024-01-15T10:30:45Z') // "Jan 15, 2024, 10:30:45 AM"
 * formatDateTime(null) // "—"
 */
export function formatDateTime(
  date: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (date == null) {
    return NULL_DATE_PLACEHOLDER;
  }

  const dateObj = typeof date === 'string' ? safeParseIso(date) : date;
  if (!dateObj || isNaN(dateObj.getTime())) {
    return NULL_DATE_PLACEHOLDER;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium', // medium includes seconds
    ...options,
  }).format(dateObj);
}

/**
 * Formats a date for display with date component only.
 *
 * @param date - The date to format (ISO string, Date object, or null/undefined)
 * @returns Formatted date string, or placeholder if date is null/undefined
 *
 * @example
 * formatDate('2024-01-15T10:30:00Z') // "Jan 15, 2024"
 * formatDate(null) // "—"
 */
export function formatDate(date: string | Date | null): string {
  if (date == null) {
    return NULL_DATE_PLACEHOLDER;
  }

  const dateObj = typeof date === 'string' ? safeParseIso(date) : date;
  if (!dateObj || isNaN(dateObj.getTime())) {
    return NULL_DATE_PLACEHOLDER;
  }

  return new Intl.DateTimeFormat(undefined, DEFAULT_DATE_OPTIONS).format(dateObj);
}

/**
 * Calculates and formats the duration between two ISO date strings.
 *
 * @param startedAt - The start time as an ISO string
 * @param finishedAt - The end time as an ISO string, or null to calculate from now
 * @returns Human-readable duration string (e.g., "2h 30m", "45s", "1d 2h")
 *
 * @example
 * formatDuration('2024-01-15T10:00:00Z', '2024-01-15T12:30:00Z') // "2h 30m"
 * formatDuration('2024-01-15T10:00:00Z') // Duration from start to now
 */
export function formatDuration(startedAt: string, finishedAt?: string | null): string {
  const startDate = safeParseIso(startedAt);
  if (!startDate) {
    return NULL_DATE_PLACEHOLDER;
  }

  const endDate = finishedAt ? safeParseIso(finishedAt) : new Date();
  if (!endDate || isNaN(endDate.getTime())) {
    return NULL_DATE_PLACEHOLDER;
  }

  const diffMs = endDate.getTime() - startDate.getTime();

  // Handle negative durations (end before start)
  const absDiffMs = Math.abs(diffMs);

  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours % 24 > 0) {
    parts.push(`${hours % 24}h`);
  }
  if (minutes % 60 > 0) {
    parts.push(`${minutes % 60}m`);
  }
  if (seconds % 60 > 0 || parts.length === 0) {
    parts.push(`${seconds % 60}s`);
  }

  return parts.join(' ');
}

/**
 * Returns the timestamp value of a date for sorting and comparison.
 *
 * @param date - The date to get timestamp from (ISO string or Date object)
 * @returns The timestamp in milliseconds since Unix epoch
 * @throws {Error} If the date is invalid
 *
 * @example
 * getTimestamp('2024-01-15T10:30:00Z') // 1705315800000
 * getTimestamp(new Date('2024-01-15')) // 1705276800000
 */
export function getTimestamp(date: string | Date): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return dateObj.getTime();
}

/**
 * Helper function for sorting arrays by date.
 *
 * @param a - First date string (ISO format)
 * @param b - Second date string (ISO format)
 * @param order - Sort order: 'asc' for oldest first, 'desc' for newest first (default)
 * @returns Negative, zero, or positive number for sorting
 *
 * @example
 * dates.sort((a, b) => sortDates(a, b, 'desc')) // Newest first
 * dates.sort((a, b) => sortDates(a, b, 'asc')) // Oldest first
 */
export function sortDates(a: string, b: string, order: 'asc' | 'desc' = 'desc'): number {
  const timestampA = getTimestamp(a);
  const timestampB = getTimestamp(b);

  if (order === 'asc') {
    return timestampA - timestampB;
  }
  return timestampB - timestampA;
}

/**
 * Safely parses an ISO string to a Date object.
 *
 * @param iso - The ISO string to parse, or null/undefined
 * @returns Date object if parsing succeeds, null otherwise
 *
 * @example
 * safeParseIso('2024-01-15T10:30:00Z') // Date object
 * safeParseIso(null) // null
 * safeParseIso('invalid') // null
 */
export function safeParseIso(iso: string | null | undefined): Date | null {
  if (iso == null) {
    return null;
  }

  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}
