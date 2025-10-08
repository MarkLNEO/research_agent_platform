export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

export function isRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('429') || message.includes('rate limit');
}

export function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('ECONNREFUSED') ||
    message.includes('timeout')
  );
}

export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('401') || message.includes('403') || message.includes('authentication');
}

export function getCreditExhaustedError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('402') || message.includes('credit') || message.includes('insufficient');
}

export function getUserFriendlyError(error: unknown): string {
  if (getCreditExhaustedError(error)) {
    return 'You have insufficient credits. Please upgrade your plan to continue.';
  }

  if (isRateLimitError(error)) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (isNetworkError(error)) {
    return 'Network connection issue. Please check your internet and try again.';
  }

  if (isAuthError(error)) {
    return 'Authentication error. Please sign out and sign in again.';
  }

  const message = getErrorMessage(error);

  if (message.includes('timeout')) {
    return 'Request timed out. The operation took too long. Please try again.';
  }

  if (message.includes('500')) {
    return 'Server error. Our team has been notified. Please try again later.';
  }

  return `Error: ${message}`;
}
