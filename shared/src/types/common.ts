/**
 * Common types shared across the GitVibe application
 * These types are used for API responses and general data structures
 */

import { z } from 'zod';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: true;
  message: string;
  details?: unknown;
  statusCode?: number;
}

/**
 * Zod schema for ErrorResponse validation
 */
export const ErrorResponseSchema = z.object({
  error: z.literal(true),
  message: z.string(),
  details: z.unknown().optional(),
  statusCode: z.number().optional(),
});

/**
 * Standard success response wrapper
 */
export interface SuccessResponse<T> {
  data: T;
}

/**
 * Zod schema for SuccessResponse validation
 */
export function createSuccessResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

/**
 * Paginated response format
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Zod schema for PaginatedResponse validation
 */
export function createPaginatedResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });
}
