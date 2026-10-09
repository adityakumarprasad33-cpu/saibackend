/**
 * Grievance DTO Contracts
 *
 * Domain aggregates are NEVER returned directly in API contracts.
 */

export interface CreateGrievanceRequestDTO {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string | undefined;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent' | undefined;
  location: {
    addressText: string;
    pincode: string;
    district: string;
    stateCode: string;
    latitude?: number | undefined;
    longitude?: number | undefined;
  };
}

export interface GrievanceResponseDTO {
  publicId: string;
  uuid: string;
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string | undefined;
  departmentId?: string | undefined;
  priority: string;
  state: string;
  location: {
    addressText: string;
    pincode: string;
    district: string;
    stateCode: string;
  };
  submittedAt: string;
}

export interface TimelineEventDTO {
  eventId: string;
  eventType: string;
  title: string;
  description: string;
  timestamp: string;
}

export interface CommentDTO {
  commentId: string;
  authorUserId: string;
  authorRole: string;
  visibility: 'Citizen' | 'Officer' | 'Department' | 'Internal' | 'System';
  message: string;
  createdAt: string;
}
