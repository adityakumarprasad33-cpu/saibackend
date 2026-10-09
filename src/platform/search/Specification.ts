/**
 * Specification Pattern Infrastructure
 *
 * Provides composite search specification interfaces for filtering, sorting, and cursor pagination.
 */

export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationCriteria {
  limit: number;
  cursor?: string | undefined;
}

export interface ISpecification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export class BaseQuerySpecification<T> implements ISpecification<T> {
  constructor(
    public readonly filters: Record<string, unknown> = {},
    public readonly sorting: SortCriteria[] = [],
    public readonly pagination: PaginationCriteria = { limit: 20 }
  ) {}

  public isSatisfiedBy(_candidate: T): boolean {
    return true;
  }
}
