/**
 * Centralized Configuration Provider & Profile Validation Engine
 */

export type EnvironmentProfile = 'development' | 'testing' | 'staging' | 'production';

export interface PlatformConfig {
  environment: EnvironmentProfile;
  port: number;
  apiPrefix: string;
  firebaseProjectId: string;
  corsAllowedOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export class ConfigProvider {
  private static instance: ConfigProvider;
  private config: PlatformConfig;

  private constructor() {
    const env = (process.env.NODE_ENV as EnvironmentProfile) || 'development';
    this.config = {
      environment: env,
      port: Number(process.env.PORT) || 5000,
      apiPrefix: '/api/v1',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'samadhan-ai-78311',
      corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:8080,http://127.0.0.1:8080,http://localhost:8085,http://127.0.0.1:8085,http://localhost:3000,http://localhost:5000')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      rateLimitMax: 100,
      rateLimitWindowMs: 60000,
    };

    this.validate();
  }

  public static getInstance(): ConfigProvider {
    if (!ConfigProvider.instance) {
      ConfigProvider.instance = new ConfigProvider();
    }
    return ConfigProvider.instance;
  }

  public getConfig(): PlatformConfig {
    return { ...this.config };
  }

  private validate(): void {
    if (this.config.port <= 0 || this.config.port > 65535) {
      throw new Error(`[ConfigProvider] Invalid port: ${this.config.port}`);
    }
    if (this.config.environment === 'production') {
      const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN;
      if (!configuredOrigins || this.config.corsAllowedOrigins.length === 0 || this.config.corsAllowedOrigins.includes('*')) {
        throw new Error('[ConfigProvider] Production requires explicit CORS_ALLOWED_ORIGINS.');
      }
      for (const origin of this.config.corsAllowedOrigins) {
        let parsed: URL;
        try { parsed = new URL(origin); } catch { throw new Error(`[ConfigProvider] Invalid CORS origin: ${origin}`); }
        if (parsed.protocol !== 'https:') throw new Error('[ConfigProvider] Production CORS origins must use HTTPS.');
      }
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('[ConfigProvider] Production requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET for evidence storage.');
      }
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('[ConfigProvider] Production requires Firebase Admin project ID, client email, and private key environment variables.');
      }
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('[ConfigProvider] Production requires GEMINI_API_KEY for image analysis and generated grievance text.');
      }
      if (!process.env.REDIS_URL) {
        throw new Error('[ConfigProvider] Production requires REDIS_URL for distributed rate limiting.');
      }
      if (!process.env.HMAC_SECRET || Buffer.byteLength(process.env.HMAC_SECRET, 'utf8') < 32) {
        throw new Error('[ConfigProvider] Production requires HMAC_SECRET with at least 32 bytes.');
      }
    }
  }
}
