import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';

export interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  phone?: string | undefined;
  passwordHash: string;
  salt: string;
  roleId: 'Citizen' | 'NodalOfficer' | 'DepartmentAdmin' | 'SuperAdmin';
  accountState: 'Active' | 'Suspended';
  createdAt: string;
  lastLoginAt?: string | undefined;
}

export class JsonUserStore {
  private static readonly DATA_DIR = path.resolve(__dirname, '../../../../data');
  private static readonly FILE_PATH = path.join(JsonUserStore.DATA_DIR, 'users.json');
  private static users: Map<string, UserRecord> = new Map();
  private static initialized = false;

  private static hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  private static generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  public static initialize(): void {
    if (this.initialized) return;

    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(this.FILE_PATH)) {
      try {
        const raw = fs.readFileSync(this.FILE_PATH, 'utf-8');
        const list = JSON.parse(raw) as UserRecord[];
        for (const u of list) {
          this.users.set(u.id, u);
        }
        console.log(`[JsonUserStore] Loaded ${this.users.size} registered users from disk.`);
      } catch (e) {
        console.error('[JsonUserStore] Error loading users.json:', e);
      }
    }

    this.initialized = true;
  }

  private static persist(): void {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(this.FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error('[JsonUserStore] Failed to write users.json to disk:', e);
    }
  }

  public static findByEmailOrPhone(identifier: string): UserRecord | null {
    this.initialize();
    const clean = identifier.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean) return u;
      if (u.phone && u.phone.replace(/[\s+-]/g, '') === clean.replace(/[\s+-]/g, '')) return u;
    }
    return null;
  }

  public static findById(id: string): UserRecord | null {
    this.initialize();
    return this.users.get(id) || null;
  }

  public static verifyPassword(password: string, user: UserRecord): boolean {
    const computedHash = this.hashPassword(password, user.salt);
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
  }

  public static createUser(params: {
    displayName: string;
    email: string;
    phone?: string;
    password: string;
    roleId?: 'Citizen' | 'NodalOfficer' | 'DepartmentAdmin';
  }): UserRecord {
    this.initialize();

    // Verify uniqueness
    const existing = this.findByEmailOrPhone(params.email);
    if (existing) {
      throw new Error(`Account already exists with email: ${params.email}`);
    }
    if (params.phone) {
      const existingPhone = this.findByEmailOrPhone(params.phone);
      if (existingPhone) {
        throw new Error(`Account already exists with phone number: ${params.phone}`);
      }
    }

    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(params.password, salt);

    const user: UserRecord = {
      id: `usr-cit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      displayName: params.displayName.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone?.trim(),
      salt,
      passwordHash,
      roleId: params.roleId || 'Citizen',
      accountState: 'Active',
      createdAt: new Date().toISOString(),
    };

    this.users.set(user.id, user);
    this.persist();
    console.log(`[JsonUserStore] Real citizen user registered: ${user.email} (${user.id})`);

    // Synchronize to Firestore live database
    FirestoreService.saveUser(user).catch((err) => {
      console.warn(`[JsonUserStore] Failed to sync new user ${user.id} to Firestore:`, err);
    });

    return user;
  }

  public static recordLogin(userId: string): void {
    const u = this.users.get(userId);
    if (u) {
      u.lastLoginAt = new Date().toISOString();
      this.persist();

      // Synchronize updated login timestamp to Firestore
      FirestoreService.saveUser(u).catch((err) => {
        console.warn(`[JsonUserStore] Failed to sync login timestamp for ${u.id} to Firestore:`, err);
      });
    }
  }
}
