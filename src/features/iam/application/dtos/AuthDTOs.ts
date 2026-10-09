/**
 * Standardized IAM API Contract DTOs
 *
 * Domain entities are NEVER exposed directly in HTTP API responses.
 */

export interface UserResponseDTO {
  userId: string;
  email: string;
  phone: string;
  displayName: string;
  photoUrl?: string | undefined;
  roleId: string;
  departmentId?: string | undefined;
  designation?: string | undefined;
  accountState: string;
  verificationStatus: string;
  languagePreference: string;
  createdAt: string;
  lastLoginAt?: string | undefined;
}

export interface SessionResponseDTO {
  sessionId: string;
  deviceId: string;
  platform: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

export interface AuthResponseDTO {
  token: string;
  expiresIn: number;
  user: UserResponseDTO;
  session: SessionResponseDTO;
}

export interface PermissionResponseDTO {
  roleId: string;
  permissions: string[];
}

export interface ErrorResponseDTO {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
  timestamp: string;
  correlationId?: string | undefined;
}
