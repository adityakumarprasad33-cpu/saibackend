/**
 * AI Safety Engine
 *
 * Handles prompt injection detection, PII sanitization, and confidence threshold checks.
 */

export class AiSafetyEngine {
  public static sanitizeInput(input: string): string {
    // Redact 12-digit Aadhaar / Phone pattern placeholders for privacy
    let sanitized = input.replace(/\b\d{12}\b/g, '[REDACTED_AADHAAR]');
    sanitized = sanitized.replace(/\b\d{10}\b/g, '[REDACTED_PHONE]');
    return sanitized;
  }

  public static detectInjection(input: string): boolean {
    const injectionPatterns = [/ignore previous instructions/i, /system prompt/i, /override rules/i];
    return injectionPatterns.some((pattern) => pattern.test(input));
  }

  public static isConfidenceAcceptable(confidence: number, threshold = 0.75): boolean {
    return confidence >= threshold;
  }
}
