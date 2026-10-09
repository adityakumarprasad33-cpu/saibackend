/**
 * Public Grievance ID Generator
 *
 * Generates human-readable public Grievance ID: SAM-<STATE_CODE>-<YEAR>-<8_DIGIT_SEQ>
 * Example: SAM-BR-2026-00001234
 */

export class PublicGrievanceIdGenerator {
  public static generate(stateCode: string, sequenceNumber: number): string {
    const cleanState = (stateCode || 'IN').toUpperCase().substring(0, 2);
    const year = new Date().getFullYear();
    const formattedSeq = String(sequenceNumber).padStart(8, '0');

    return `SAM-${cleanState}-${year}-${formattedSeq}`;
  }
}
