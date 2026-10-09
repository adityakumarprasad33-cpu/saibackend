/**
 * Case Management DTO Contracts
 */

export interface AcceptCaseRequestDTO {
  grievanceUuid: string;
  departmentId: string;
  severity: 'Minor' | 'Moderate' | 'Major' | 'Critical';
}

export interface AssignCaseRequestDTO {
  caseId: string;
  officerId?: string | undefined;
  reason?: string | undefined;
}

export interface ResolveCaseRequestDTO {
  caseId: string;
  summary: string;
  detailedNotes: string;
  evidenceReferences: string[];
}

export interface CaseResponseDTO {
  caseId: string;
  caseNumber: string;
  grievanceUuid: string;
  publicGrievanceId: string;
  departmentId: string;
  assignedOfficerId?: string | undefined;
  status: string;
  priority: string;
  severity: string;
  lastActivityAt: string;
  estimatedResolutionDate: string;
  version: number;
}
