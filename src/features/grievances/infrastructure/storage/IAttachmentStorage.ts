/**
 * Attachment Storage Interface Contract
 *
 * Decouples storage providers (Firebase Storage, AWS S3, GCS) from domain logic.
 */

export interface AttachmentUploadRequest {
  attachmentId: string;
  originalFilename: string;
  contentType: string;
  buffer: Buffer;
}

export interface AttachmentUploadResult {
  attachmentId: string;
  storageRef: string;
  fileSize: number;
  sha256Hash: string;
}

export interface IAttachmentStorage {
  upload(request: AttachmentUploadRequest): Promise<AttachmentUploadResult>;
  getDownloadUrl(storageRef: string): Promise<string>;
  delete(storageRef: string): Promise<void>;
}
