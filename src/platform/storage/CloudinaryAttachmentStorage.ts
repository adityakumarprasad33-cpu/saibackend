import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'node:crypto';
import { AttachmentUploadRequest, AttachmentUploadResult, IAttachmentStorage } from '../../features/grievances/infrastructure/storage/IAttachmentStorage';

interface CloudinaryReference {
  publicId: string;
  format: string;
  resourceType: 'image';
  type: 'authenticated';
}

function configureCloudinary(): void {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the backend.');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

function parseReference(storageRef: string): CloudinaryReference {
  let reference: CloudinaryReference;
  try {
    reference = JSON.parse(storageRef) as CloudinaryReference;
  } catch {
    throw new Error('Invalid Cloudinary attachment reference.');
  }
  if (!reference.publicId || !reference.format || reference.resourceType !== 'image' || reference.type !== 'authenticated') {
    throw new Error('Invalid Cloudinary attachment reference.');
  }
  return reference;
}

export class CloudinaryAttachmentStorage implements IAttachmentStorage {
  public async checkConnection(): Promise<void> {
    configureCloudinary();
    await cloudinary.api.ping();
  }

  public async upload(request: AttachmentUploadRequest): Promise<AttachmentUploadResult> {
    configureCloudinary();
    const publicId = `samadhanai/grievances/${request.attachmentId}`;
    const result = await cloudinary.uploader.upload(
      `data:${request.contentType};base64,${request.buffer.toString('base64')}`,
      {
        public_id: publicId,
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        context: { original_filename: request.originalFilename },
      },
    );
    const storageRef = JSON.stringify({
      publicId: result.public_id,
      format: result.format,
      resourceType: 'image',
      type: 'authenticated',
    } satisfies CloudinaryReference);
    return {
      attachmentId: request.attachmentId,
      storageRef,
      fileSize: result.bytes,
      sha256Hash: createHash('sha256').update(request.buffer).digest('hex'),
    };
  }

  public async getDownloadUrl(storageRef: string): Promise<string> {
    configureCloudinary();
    const reference = parseReference(storageRef);
    return cloudinary.utils.private_download_url(reference.publicId, reference.format, {
      resource_type: reference.resourceType,
      type: reference.type,
      expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
    });
  }

  public async delete(storageRef: string): Promise<void> {
    configureCloudinary();
    const reference = parseReference(storageRef);
    await cloudinary.api.delete_resources([reference.publicId], {
      resource_type: reference.resourceType,
      type: reference.type,
    });
  }
}
