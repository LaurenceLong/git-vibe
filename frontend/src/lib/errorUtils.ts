/**
 * Utility functions for error handling
 */

import { AxiosError } from 'axios';

/**
 * Extracts the actual error message from an error object.
 * Handles axios errors and extracts the message from the API response.
 *
 * @param error - The error object (can be Error, AxiosError, or unknown)
 * @param fallbackMessage - Optional fallback message if extraction fails
 * @returns The extracted error message
 */
export function extractErrorMessage(
  error: unknown,
  fallbackMessage: string = 'An unexpected error occurred'
): string {
  // Handle axios errors
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<{ message?: string; error?: boolean }>;

    // Try to get message from response.data.message
    if (axiosError.response?.data) {
      const data = axiosError.response.data;

      // Handle object responses with message field
      if (typeof data === 'object' && data !== null) {
        if ('message' in data && typeof data.message === 'string' && data.message) {
          return data.message;
        }
        // Handle error field that might contain the message
        if ('error' in data && typeof data.error === 'string' && data.error) {
          return data.error;
        }
      }

      // Handle string responses
      if (typeof data === 'string' && data) {
        return data;
      }
    }

    // Fallback to axios error message
    if (axiosError.message) {
      return axiosError.message;
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message || fallbackMessage;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Fallback
  return fallbackMessage;
}
