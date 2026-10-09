/**
 * RFC 9457 Standardized Problem Details Error Response Format
 */

export interface ProblemDetailsProps {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  correlationId?: string | undefined;
  invalidParams?: Array<{ name: string; reason: string }> | undefined;
}

export class ProblemDetails {
  public static create(props: ProblemDetailsProps): ProblemDetailsProps {
    return {
      type: props.type || 'https://samadhan.gov.in/errors/api-error',
      title: props.title,
      status: props.status,
      detail: props.detail,
      instance: props.instance,
      code: props.code,
      correlationId: props.correlationId,
      invalidParams: props.invalidParams,
    };
  }
}
