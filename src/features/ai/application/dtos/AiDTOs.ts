/**
 * AI Platform DTO Contracts
 */

import { AiResponseMetadata } from '../../infrastructure/providers/IAiProvider';

export interface ClassifyGrievanceRequestDTO {
  title: string;
  description: string;
  district?: string | undefined;
  stateCode?: string | undefined;
}

export interface ClassifyGrievanceResponseDTO {
  categoryId: string;
  subcategoryId: string;
  priority: string;
  severity: string;
  metadata: AiResponseMetadata;
}

export interface DraftAssistRequestDTO {
  publicId: string;
  description: string;
}

export interface DraftAssistResponseDTO {
  summary: string;
  actionSteps: string[];
  metadata: AiResponseMetadata;
}

export interface DuplicateCheckRequestDTO {
  targetText: string;
  candidateText: string;
}

export interface DuplicateCheckResponseDTO {
  isDuplicate: boolean;
  similarityScore: number;
  metadata: AiResponseMetadata;
}
