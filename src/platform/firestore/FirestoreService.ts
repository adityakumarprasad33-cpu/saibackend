/**
 * FirestoreService - Firebase Admin SDK Version
 * 
 * Uses Firebase Admin SDK with Service Account for full backend Firestore access.
 * Replaces the REST API client that had 403 permission issues.
 */

import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { firebaseAdminApp } from '../firebase/firebaseAdminApp';
import { CloudinaryAttachmentStorage } from '../storage/CloudinaryAttachmentStorage';

export interface FirestoreUser {
  id: string;
  email: string;
  displayName?: string | undefined;
  phone?: string | undefined;
  stateCode?: string | undefined;
  district?: string | undefined;
  roleId: string;
  accountState: string;
  emailVerified?: boolean | undefined;
  phoneVerified?: boolean | undefined;
  createdAt?: string | undefined;
  lastLoginAt?: string | undefined;
}

export interface FirestoreGrievance {
  publicId: string;
  uuid: string;
  title: string;
  description: string;
  department: string;
  categoryId?: string | undefined;
  slaHours: number;
  citizenUserId: string;
  citizenEmail: string;
  priority: string;
  state: string;
  location?: Record<string, any> | undefined;
  aiClassification?: Record<string, unknown> | undefined;
  attachments?: Array<{ fileName: string; contentType: string; data: Buffer }> | undefined;
  submittedAt: string;
}

let firestoreInstance: Firestore | null = null;
const attachmentStorage = new CloudinaryAttachmentStorage();

function getFirestoreInstance(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  firestoreInstance = getFirestore(firebaseAdminApp);
  return firestoreInstance;
}

export class FirestoreService {
  private static get db(): Firestore {
    return getFirestoreInstance();
  }

  public static async getUserProfile(userId: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.db.collection('users').doc(userId).get();
    return snapshot.exists ? snapshot.data() || null : null;
  }

  public static async checkConnection(): Promise<void> {
    await this.db.collection('users').limit(1).get();
  }

  public static async checkStorageConnection(): Promise<void> {
    await attachmentStorage.checkConnection();
  }

  /**
   * Persists or updates a user record in Firestore under `users/{userId}`.
   */
  public static async saveUser(user: FirestoreUser): Promise<void> {
    try {
      const now = new Date().toISOString();
      const userRef = this.db.collection('users').doc(user.id);

      const existing = await userRef.get();
      await userRef.set({
        uid: user.id,
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        ...(user.displayName ? { displayName: user.displayName } : {}),
        ...(user.phone ? { phone: user.phone } : {}),
        ...(user.stateCode ? { stateCode: user.stateCode.toUpperCase() } : {}),
        ...(user.district ? { district: user.district.trim() } : {}),
        ...(user.emailVerified !== undefined ? { isEmailVerified: user.emailVerified } : {}),
        ...(user.phoneVerified !== undefined ? { isPhoneVerified: user.phoneVerified } : {}),
        accountStatus: user.accountState,
        accountState: user.accountState,
        createdAt: user.createdAt || existing.get('createdAt') || now,
        updatedAt: now,
        lastLoginAt: user.lastLoginAt || now,
      }, { merge: true });

      console.log(`[FirestoreService] Successfully synced user ${user.email} (${user.id}) to Firestore collection 'users'.`);
    } catch (err) {
      console.error(`[FirestoreService] Error syncing user ${user.id} to Firestore:`, err);
      throw err;
    }
  }

  /**
   * Persists a grievance complaint in Firestore under `grievances/{publicId}`.
   */
  public static async createGrievance(grievance: FirestoreGrievance): Promise<void> {
    const now = new Date().toISOString();
    const slaDeadline = new Date(Date.now() + grievance.slaHours * 3600 * 1000).toISOString();
    const grievanceRef = this.db.collection('grievances').doc(grievance.publicId);
    const timelineRef = grievanceRef.collection('timeline').doc();
    const attachments = grievance.attachments || [];
    const aiClassification = grievance.aiClassification || {};
    const record = {
      trackingId: grievance.publicId,
      publicId: grievance.publicId,
      uuid: grievance.uuid,
      citizen: {
        uid: grievance.citizenUserId,
        email: grievance.citizenEmail,
        isWhistleblowerAnonymous: false,
      },
      issue: {
        title: grievance.title,
        description: grievance.description,
        ...(grievance.categoryId ? { categoryId: grievance.categoryId } : {}),
        priority: grievance.priority.toUpperCase(),
      },
      aiIntelligence: aiClassification,
      assignment: {
        departmentName: grievance.department,
        slaHours: grievance.slaHours,
        targetResponseAt: slaDeadline,
        isSlaBreached: false,
      },
      status: 'SUBMITTED',
      state: 'Submitted',
      title: grievance.title,
      description: grievance.description,
      department: grievance.department,
      ...(typeof aiClassification.departmentId === 'string' ? { departmentId: aiClassification.departmentId } : {}),
      slaHours: grievance.slaHours,
      citizenUserId: grievance.citizenUserId,
      citizenEmail: grievance.citizenEmail,
      priority: grievance.priority,
      aiClassification,
      location: grievance.location || {},
      submittedAt: grievance.submittedAt || now,
      createdAt: now,
      updatedAt: now,
    };

    const uploadedRefs: string[] = [];
    try {
      const storedAttachments = [] as Array<Record<string, unknown>>;
      for (const attachment of attachments) {
        const attachmentId = this.db.collection('_attachmentIds').doc().id;
        const stored = await attachmentStorage.upload({
          attachmentId: `${grievance.publicId}/${attachmentId}`,
          originalFilename: attachment.fileName,
          contentType: attachment.contentType,
          buffer: attachment.data,
        });
        uploadedRefs.push(stored.storageRef);
        storedAttachments.push({
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          sizeBytes: stored.fileSize,
          storageRef: stored.storageRef,
          uploadedAt: now,
        });
      }
      await this.db.runTransaction(async transaction => {
        const existing = await transaction.get(grievanceRef);
        if (existing.exists) throw new Error('Grievance identifier collision. Retry submission.');
        transaction.create(grievanceRef, record);
        transaction.create(timelineRef, {
          eventType: 'Submitted',
          title: 'Grievance submitted',
          description: 'Grievance submitted by its citizen.',
          actorUserId: grievance.citizenUserId,
          createdAt: now,
        });
        for (const attachment of storedAttachments) {
          transaction.create(grievanceRef.collection('attachments').doc(), attachment);
        }
      });
    } catch (error) {
      await Promise.all(uploadedRefs.map(ref => attachmentStorage.delete(ref).catch(() => undefined)));
      throw error;
    }
  }

  public static async listGrievanceAttachments(publicId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('grievances').doc(publicId)
      .collection('attachments').orderBy('uploadedAt', 'asc').get();
    return Promise.all(snapshot.docs.map(async doc => {
      const item = doc.data();
      let downloadUrl: string | undefined;
      if (typeof item.storageRef === 'string') {
        downloadUrl = await attachmentStorage.getDownloadUrl(item.storageRef);
      }
      return {
        id: doc.id,
        fileName: item.fileName,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        uploadedAt: item.uploadedAt,
        ...(downloadUrl ? { downloadUrl } : {}),
      };
    }));
  }

  public static async addGrievanceAttachment(
    publicId: string,
    attachment: { fileName: string; contentType: string; data: Buffer },
  ): Promise<Record<string, unknown>> {
    const id = this.db.collection('grievances').doc(publicId).collection('attachments').doc().id;
    const stored = await attachmentStorage.upload({
      attachmentId: `${publicId}/${id}`,
      originalFilename: attachment.fileName,
      contentType: attachment.contentType,
      buffer: attachment.data,
    });
    const item = {
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: stored.fileSize,
      storageRef: stored.storageRef,
      uploadedAt: new Date().toISOString(),
    };
    try {
      await this.db.collection('grievances').doc(publicId).collection('attachments').doc(id).create(item);
    } catch (error) {
      await attachmentStorage.delete(stored.storageRef).catch(() => undefined);
      throw error;
    }
    const downloadUrl = await attachmentStorage.getDownloadUrl(stored.storageRef);
    const { storageRef: _privateRef, ...publicItem } = item;
    return { id, ...publicItem, downloadUrl };
  }
  /**
   * Reads all grievances from Firestore `grievances` collection.
   */
  public static async listGrievances(citizenUserId: string): Promise<any[]> {
    try {
      const snapshot = await this.db.collection('grievances')
        .where('citizenUserId', '==', citizenUserId).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('[FirestoreService] Error listing grievances from Firestore:', err);
      throw err;
    }
  }

  /**
   * Get grievance by publicId
   */
  public static async getGrievanceByPublicId(publicId: string): Promise<any | null> {
    try {
      const doc = await this.db.collection('grievances').doc(publicId).get();
      if (!doc.exists) {
        const matches = await this.db.collection('grievances').where('uuid', '==', publicId).limit(1).get();
        const match = matches.docs[0];
        if (!match) return null;
        return { id: match.id, ...match.data() };
      }
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (err) {
      console.error(`[FirestoreService] Error getting grievance ${publicId}:`, err);
      throw err;
    }
  }

  /**
   * Update grievance status
   */
  public static async updateGrievanceStatus(publicId: string, state: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.db.collection('grievances').doc(publicId).update({
        state,
        status: state,
        updatedAt: now,
        cloudSyncTimestamp: now,
      });
    } catch (err) {
      console.error(`[FirestoreService] Error updating grievance ${publicId} status:`, err);
      throw err;
    }
  }

  /**
   * Add timeline event to grievance
   */
  public static async addTimelineEvent(publicId: string, event: any): Promise<void> {
    try {
      await this.db.collection('grievances').doc(publicId).collection('timeline').add({
        ...event,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[FirestoreService] Error adding timeline event to ${publicId}:`, err);
      throw err;
    }
  }

  public static async listTimelineEvents(publicId: string): Promise<any[]> {
    const snapshot = await this.db.collection('grievances').doc(publicId)
      .collection('timeline').orderBy('createdAt', 'asc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  public static async addGrievanceRecord(publicId: string, collection: string, record: Record<string, unknown>): Promise<string> {
    const ref = await this.db.collection('grievances').doc(publicId)
      .collection(collection).add({ ...record, createdAt: new Date().toISOString() });
    return ref.id;
  }

  public static async saveGovernmentEmployee(employee: Record<string, unknown>): Promise<void> {
    const employeeId = String(employee.employeeId);
    await this.db.collection('governmentEmployees').doc(employeeId).set(employee, { merge: true });
  }

  public static async getGovernmentEmployee(employeeId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('governmentEmployees').doc(employeeId).get();
    return doc.exists ? { ...doc.data(), employeeId: doc.id } : null;
  }

  public static async listGovernmentEmployees(filters: {
    departmentId?: string | undefined;
    sectorId?: string | undefined;
    search?: string | undefined;
  }): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('governmentEmployees').get();
    let employees: Record<string, unknown>[] = snapshot.docs.map(doc => ({ ...doc.data(), employeeId: doc.id }));
    if (filters.departmentId) employees = employees.filter(e => e.departmentId === filters.departmentId);
    if (filters.sectorId) employees = employees.filter(e => e.sectorId === filters.sectorId);
    if (filters.search) {
      const search = filters.search.toLowerCase();
      employees = employees.filter(e => [e.fullName, e.employeeCode, e.email]
        .some(value => String(value || '').toLowerCase().includes(search)));
    }
    return employees;
  }

  public static async updateGovernmentEmployee(
    employeeId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection('governmentEmployees').doc(employeeId).update({
      ...changes,
      updatedAt: new Date().toISOString(),
    });
  }

  public static async addAdminAuditLog(record: Record<string, unknown>): Promise<void> {
    await this.db.collection('adminAuditLogs').add({ ...record, timestamp: new Date().toISOString() });
  }

  public static async listAdminAuditLogs(): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('adminAuditLogs').orderBy('timestamp', 'desc').limit(100).get();
    return snapshot.docs.map(doc => ({ auditId: doc.id, ...doc.data() }));
  }

  public static async listCollection(collection: string, filters: Record<string, string> = {}): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection(collection).get();
    let rows: Record<string, unknown>[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    for (const [field, value] of Object.entries(filters)) {
      rows = rows.filter(row => row[field] === value);
    }
    return rows;
  }

  public static async listAllGrievances(): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('grievances').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  public static async updateGrievance(publicId: string, changes: Record<string, unknown>): Promise<void> {
    await this.db.collection('grievances').doc(publicId).update({
      ...changes,
      updatedAt: new Date().toISOString(),
    });
  }

  public static async listNotifications(userId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('users').doc(userId).collection('notifications')
      .orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  public static async getNotification(userId: string, notificationId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('users').doc(userId).collection('notifications').doc(notificationId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  public static async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const ref = this.db.collection('users').doc(userId).collection('notifications').doc(notificationId);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.update({ isRead: true, readAt: new Date().toISOString() });
    return true;
  }

  public static async markAllNotificationsRead(userId: string): Promise<number> {
    const snapshot = await this.db.collection('users').doc(userId).collection('notifications')
      .where('isRead', '==', false).get();
    if (snapshot.empty) return 0;
    const batch = this.db.batch();
    const readAt = new Date().toISOString();
    snapshot.docs.forEach(doc => batch.update(doc.ref, { isRead: true, readAt }));
    await batch.commit();
    return snapshot.size;
  }

  public static async getNotificationPreferences(userId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('users').doc(userId).collection('settings').doc('notifications').get();
    return doc.exists ? doc.data() || null : null;
  }

  public static async saveNotificationPreferences(userId: string, preferences: Record<string, unknown>): Promise<void> {
    await this.db.collection('users').doc(userId).collection('settings').doc('notifications').set({
      ...preferences,
      userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
}
