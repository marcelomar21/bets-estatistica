/**
 * Input Validators Module
 * Story 17.4: Implementar Validação Padronizada de Input
 *
 * Provides consistent validation for external IDs across the application.
 * All validators return: { valid: boolean, value?: T, error?: { code: string, message: string } }
 */

/**
 * Validate Telegram ID (must be positive integer)
 * @param {string|number} id - Telegram ID to validate
 * @returns {{ valid: boolean, value?: number, error?: { code: string, message: string } }}
 */
function validateTelegramId(id) {
  if (id === null || id === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_TELEGRAM_ID', message: 'Telegram ID is required' },
    };
  }

  const numId = typeof id === 'string' ? parseInt(id, 10) : id;

  if (isNaN(numId) || !Number.isInteger(numId)) {
    return {
      valid: false,
      error: { code: 'INVALID_TELEGRAM_ID', message: 'Telegram ID must be an integer' },
    };
  }

  if (numId <= 0) {
    return {
      valid: false,
      error: { code: 'INVALID_TELEGRAM_ID', message: 'Telegram ID must be positive' },
    };
  }

  return { valid: true, value: numId };
}

/**
 * Validate Subscription ID (non-empty string)
 * @param {string} id - Subscription ID to validate
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateSubscriptionId(id) {
  if (id === null || id === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_SUBSCRIPTION_ID', message: 'Subscription ID is required' },
    };
  }

  if (typeof id !== 'string') {
    return {
      valid: false,
      error: { code: 'INVALID_SUBSCRIPTION_ID', message: 'Subscription ID must be a string' },
    };
  }

  const trimmed = id.trim();
  if (trimmed === '') {
    return {
      valid: false,
      error: { code: 'INVALID_SUBSCRIPTION_ID', message: 'Subscription ID cannot be empty' },
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate UUID format (v4)
 * @param {string} id - UUID to validate
 * @param {string} fieldName - Field name for error message (default: 'ID')
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateUUID(id, fieldName = 'ID') {
  if (id === null || id === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_UUID', message: `${fieldName} is required` },
    };
  }

  if (typeof id !== 'string') {
    return {
      valid: false,
      error: { code: 'INVALID_UUID', message: `${fieldName} must be a string` },
    };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return {
      valid: false,
      error: { code: 'INVALID_UUID', message: `${fieldName} has invalid UUID format` },
    };
  }

  return { valid: true, value: id.toLowerCase() };
}

/**
 * Validate Member ID (non-empty string or positive integer)
 * Accepts: positive integers, numeric strings, UUIDs, or any non-empty string ID
 * @param {string|number} id - Member ID to validate
 * @returns {{ valid: boolean, value?: string|number, error?: { code: string, message: string } }}
 */
function validateMemberId(id) {
  if (id === null || id === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_MEMBER_ID', message: 'Member ID is required' },
    };
  }

  // Accept positive integers
  if (typeof id === 'number') {
    if (!Number.isInteger(id) || id <= 0) {
      return {
        valid: false,
        error: { code: 'INVALID_MEMBER_ID', message: 'Numeric Member ID must be a positive integer' },
      };
    }
    return { valid: true, value: id };
  }

  // Accept non-empty strings (UUIDs, numeric strings, any string ID)
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (trimmed === '') {
      return {
        valid: false,
        error: { code: 'INVALID_MEMBER_ID', message: 'Member ID cannot be empty' },
      };
    }
    return { valid: true, value: trimmed };
  }

  return {
    valid: false,
    error: { code: 'INVALID_MEMBER_ID', message: 'Member ID must be a string or positive integer' },
  };
}

/**
 * Validate Bet ID (UUID format)
 * @param {string} id - Bet ID to validate
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateBetId(id) {
  const result = validateUUID(id, 'Bet ID');
  if (!result.valid) {
    result.error.code = 'INVALID_BET_ID';
  }
  return result;
}

/**
 * Validate Email format
 * @param {string} email - Email to validate
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateEmail(email) {
  if (email === null || email === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_EMAIL', message: 'Email is required' },
    };
  }

  if (typeof email !== 'string') {
    return {
      valid: false,
      error: { code: 'INVALID_EMAIL', message: 'Email must be a string' },
    };
  }

  const trimmed = email.trim().toLowerCase();
  if (trimmed === '') {
    return {
      valid: false,
      error: { code: 'INVALID_EMAIL', message: 'Email cannot be empty' },
    };
  }

  // Simple email regex - covers most cases without being overly strict
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return {
      valid: false,
      error: { code: 'INVALID_EMAIL', message: 'Invalid email format' },
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate positive integer
 * @param {string|number} value - Value to validate
 * @param {string} fieldName - Field name for error message
 * @returns {{ valid: boolean, value?: number, error?: { code: string, message: string } }}
 */
function validatePositiveInt(value, fieldName = 'Value') {
  if (value === null || value === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} is required` },
    };
  }

  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(numValue) || !Number.isInteger(numValue)) {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} must be an integer` },
    };
  }

  if (numValue <= 0) {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} must be positive` },
    };
  }

  return { valid: true, value: numValue };
}

/**
 * Validate non-empty string
 * @param {string} value - Value to validate
 * @param {string} fieldName - Field name for error message
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateNonEmptyString(value, fieldName = 'Value') {
  if (value === null || value === undefined) {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} is required` },
    };
  }

  if (typeof value !== 'string') {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} must be a string` },
    };
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return {
      valid: false,
      error: { code: 'INVALID_INPUT', message: `${fieldName} cannot be empty` },
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate webhook event ID (idempotency key)
 * @param {string} eventId - Event ID to validate
 * @returns {{ valid: boolean, value?: string, error?: { code: string, message: string } }}
 */
function validateWebhookEventId(eventId) {
  const result = validateNonEmptyString(eventId, 'Event ID');
  if (!result.valid) {
    result.error.code = 'INVALID_WEBHOOK_EVENT_ID';
  }
  return result;
}

module.exports = {
  validateTelegramId,
  validateSubscriptionId,
  validateUUID,
  validateMemberId,
  validateBetId,
  validateEmail,
  validatePositiveInt,
  validateNonEmptyString,
  validateWebhookEventId,
};
