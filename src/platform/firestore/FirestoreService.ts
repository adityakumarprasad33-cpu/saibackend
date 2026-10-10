/**
 * FirestoreService - Firebase Admin SDK Version
 * 
 * Uses Firebase Admin SDK with Service Account for full backend Firestore access.
 * Replaces the REST API client that had 403 permission issues.
 */

import { getFirestore, Firestore, Query, FieldValue } from 'firebase-admin/firestore';
import { firebaseAdminApp } from '../firebase/firebaseAdminApp';
import { CloudinaryAttachmentStorage } from '../storage/CloudinaryAttachmentStorage';
import { createHash } from 'crypto';
import { isPermissionId, PermissionId } from '../authorization/PermissionCatalog';

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
  slaHours?: number | undefined;
  citizenUserId: string;
  citizenEmail: string;
  priority: string;
  state: string;
  departmentId?: string | undefined;
  jurisdictionId?: string | undefined;
  routingStatus?: 'NeedsTriage' | 'Routed' | undefined;
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

      console.log(`[FirestoreService] Successfully synced user profile ${user.id} to Firestore collection 'users'.`);
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
    const slaDeadline = typeof grievance.slaHours === 'number' && grievance.slaHours > 0
      ? new Date(Date.now() + grievance.slaHours * 3600 * 1000).toISOString()
      : undefined;
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
        ...(typeof grievance.slaHours === 'number' ? { slaHours: grievance.slaHours } : {}),
        ...(slaDeadline ? { targetResponseAt: slaDeadline } : {}),
        isSlaBreached: false,
      },
      status: 'SUBMITTED',
      state: 'Submitted',
      title: grievance.title,
      description: grievance.description,
      department: grievance.department,
      ...(typeof grievance.slaHours === 'number' ? { slaHours: grievance.slaHours } : {}),
      ...(grievance.departmentId ? { departmentId: grievance.departmentId } : {}),
      ...(grievance.jurisdictionId ? { jurisdictionId: grievance.jurisdictionId } : {}),
      ...(grievance.routingStatus ? { routingStatus: grievance.routingStatus } : {}),
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

  public static async listCitizenGrievances(
    citizenUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: Record<string, any>[]; nextCursor: string | null }> {
    let query = this.db.collection('grievances')
      .where('citizenUserId', '==', citizenUserId)
      .orderBy('submittedAt', 'desc')
      .limit(limit + 1);
    if (cursor) {
      const cursorSnapshot = await this.db.collection('grievances').doc(cursor).get();
      if (!cursorSnapshot.exists || cursorSnapshot.get('citizenUserId') !== citizenUserId) {
        return { items: [], nextCursor: null };
      }
      query = query.startAfter(cursorSnapshot);
    }
    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const page = snapshot.docs.slice(0, limit);
    return {
      items: page.map(doc => ({ id: doc.id, ...doc.data() })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  public static async listScopedGrievances(
    departmentId: string,
    jurisdictionIds: string[],
    limit: number,
    cursor?: string,
  ): Promise<{ items: Record<string, any>[]; nextCursor: string | null }> {
    if (!departmentId || jurisdictionIds.length === 0) return { items: [], nextCursor: null };
    let query = this.db.collection('grievances')
      .where('departmentId', '==', departmentId)
      .where('jurisdictionId', 'in', jurisdictionIds.slice(0, 30))
      .orderBy('submittedAt', 'desc')
      .limit(limit + 1);
    if (cursor) {
      const cursorSnapshot = await this.db.collection('grievances').doc(cursor).get();
      if (!cursorSnapshot.exists || cursorSnapshot.get('departmentId') !== departmentId ||
          !jurisdictionIds.includes(String(cursorSnapshot.get('jurisdictionId') || ''))) {
        return { items: [], nextCursor: null };
      }
      query = query.startAfter(cursorSnapshot);
    }
    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const page = snapshot.docs.slice(0, limit);
    return {
      items: page.map(doc => ({ id: doc.id, ...doc.data() })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  public static async listOfficerGrievances(
    uid: string,
    departmentId: string,
    jurisdictionIds: string[],
  ): Promise<Record<string, any>[]> {
    if (!departmentId || jurisdictionIds.length === 0) return [];
    const snapshot = await this.db.collection('grievances')
      .where('departmentId', '==', departmentId)
      .where('jurisdictionId', 'in', jurisdictionIds.slice(0, 30))
      .where('assignment.assignedOfficerId', '==', uid)
      .limit(501)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  public static async listAllScopedGrievances(
    departmentId: string,
    jurisdictionIds: string[],
  ): Promise<Record<string, any>[]> {
    if (!departmentId || jurisdictionIds.length === 0) return [];
    const snapshot = await this.db.collection('grievances')
      .where('departmentId', '==', departmentId)
      .where('jurisdictionId', 'in', jurisdictionIds.slice(0, 30))
      .limit(1001)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

  /**
   * Atomically applies a workflow mutation and its timeline event. The caller
   * supplies the state/version it authorized; a stale concurrent request gets
   * false and must reload before attempting another transition.
   */
  public static async commitGrievanceWorkflow(
    publicId: string,
    expectedState: string,
    expectedVersion: number,
    changes: Record<string, unknown>,
    event: Record<string, unknown>,
    authorization: { actorUid: string; permission: PermissionId; assignmentTargetUid?: string },
  ): Promise<boolean> {
    const grievanceRef = this.db.collection('grievances').doc(publicId);
    const employeeRef = this.db.collection('governmentEmployees').doc(authorization.actorUid);
    const timelineRef = grievanceRef.collection('timeline').doc();
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(grievanceRef);
      const actor = await transaction.get(employeeRef);
      const targetUid = authorization.assignmentTargetUid;
      const target = targetUid
        ? targetUid === authorization.actorUid ? actor : await transaction.get(this.db.collection('governmentEmployees').doc(targetUid))
        : null;
      if (!snapshot.exists || snapshot.get('state') !== expectedState ||
          Number(snapshot.get('version') || 0) !== expectedVersion) return false;

      const permissions: unknown = actor.get('permissions');
      const actorRole = String(actor.get('primaryRole') || '').toLowerCase();
      const actorJurisdictions: unknown = actor.get('jurisdictionIds');
      const grievanceDepartment = snapshot.get('departmentId');
      const grievanceJurisdiction = snapshot.get('jurisdictionId');
      const permittedRole = ['governmentofficial', 'nodalofficer', 'departmentadmin', 'superadmin'].includes(actorRole);
      const crossScope = actorRole === 'superadmin' && Array.isArray(permissions) && permissions.includes('grievance.cross_scope');
      const scopeMatches = crossScope || (
        typeof grievanceDepartment === 'string' && actor.get('departmentId') === grievanceDepartment &&
        typeof grievanceJurisdiction === 'string' && Array.isArray(actorJurisdictions) && actorJurisdictions.includes(grievanceJurisdiction)
      );
      if (!actor.exists || actor.get('employeeId') !== authorization.actorUid ||
          actor.get('authProviderUid') !== authorization.actorUid || actor.get('accountStatus') !== 'Active' ||
          actor.get('identityVerificationStatus') !== 'Verified' || !permittedRole ||
          !Array.isArray(permissions) || permissions.some(id => !isPermissionId(id)) ||
          !permissions.includes(authorization.permission) || !scopeMatches) return false;
      if (targetUid) {
        const targetJurisdictions: unknown = target?.get('jurisdictionIds');
        const targetRole = String(target?.get('primaryRole') || '');
        if (!target?.exists || target.get('employeeId') !== targetUid || target.get('authProviderUid') !== targetUid ||
            target.get('accountStatus') !== 'Active' || target.get('identityVerificationStatus') !== 'Verified' ||
            !['GovernmentOfficial', 'NodalOfficer'].includes(targetRole) ||
            target.get('departmentId') !== grievanceDepartment || typeof grievanceJurisdiction !== 'string' ||
            !Array.isArray(targetJurisdictions) || !targetJurisdictions.includes(grievanceJurisdiction)) return false;
      }

      transaction.update(grievanceRef, {
        ...changes,
        version: expectedVersion + 1,
        updatedAt: now,
        cloudSyncTimestamp: now,
      });
      transaction.create(timelineRef, { ...event, createdAt: now });
      return true;
    });
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

  public static async deleteGovernmentEmployee(employeeId: string): Promise<void> {
    await this.db.collection('governmentEmployees').doc(employeeId).delete();
  }

  public static async issueEmployeeInvitation(
    employeeId: string,
    token: string,
    actorUid: string,
    requiredPermission: 'iam.employee.provision' | 'iam.employee.invite',
    ttlMilliseconds = 60 * 60 * 1000,
  ): Promise<boolean> {
    const employeeRef = this.db.collection('governmentEmployees').doc(employeeId);
    const actorRef = this.db.collection('governmentEmployees').doc(actorUid);
    const invitationRef = this.db.collection('employeeInvitations').doc(employeeId);
    const auditRef = this.db.collection('adminAuditLogs').doc();
    const now = Date.now();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.db.runTransaction(async transaction => {
        if (actorUid === employeeId) return false;
        const [employee, actor] = await Promise.all([
          transaction.get(employeeRef), transaction.get(actorRef),
        ]);
        const actorPermissions: unknown = actor.get('permissions');
        if (!employee.exists || employee.get('accountStatus') !== 'PendingActivation' || typeof employee.get('email') !== 'string' ||
            !actor.exists || actor.get('employeeId') !== actorUid || actor.get('authProviderUid') !== actorUid ||
            actor.get('accountStatus') !== 'Active' || actor.get('identityVerificationStatus') !== 'Verified' ||
            !['DepartmentAdmin', 'SuperAdmin'].includes(String(actor.get('primaryRole'))) ||
            !Array.isArray(actorPermissions) || actorPermissions.some(id => !isPermissionId(id)) ||
            !actorPermissions.includes(requiredPermission)) return false;
        const targetJurisdictions: unknown = employee.get('jurisdictionIds');
        const actorJurisdictions: unknown = actor.get('jurisdictionIds');
        const scopeSnapshots = [employee, actor];
        const hierarchyRefs = new Map<string, FirebaseFirestore.DocumentReference>();
        for (const scope of scopeSnapshots) {
          const departmentId = scope.get('departmentId');
          const sectorId = scope.get('sectorId');
          const postId = scope.get('postId');
          const jurisdictionIds = scope.get('jurisdictionIds');
          if (typeof departmentId !== 'string' || typeof sectorId !== 'string' ||
              typeof postId !== 'string' || !Array.isArray(jurisdictionIds) ||
              jurisdictionIds.length === 0 || jurisdictionIds.length > 30 ||
              jurisdictionIds.some(id => typeof id !== 'string' || !id.trim())) return false;
          for (const ref of [
            this.db.collection('departments').doc(departmentId),
            this.db.collection('sectors').doc(sectorId),
            this.db.collection('posts').doc(postId),
            ...jurisdictionIds.map(id => this.db.collection('jurisdictions').doc(id as string)),
          ]) hierarchyRefs.set(ref.path, ref);
        }
        const hierarchyDocs = await transaction.getAll(...hierarchyRefs.values());
        const hierarchyByPath = new Map(hierarchyDocs.map(doc => [doc.ref.path, doc]));
        const scopeIsCurrentAndActive = (scope: FirebaseFirestore.DocumentSnapshot): boolean => {
          const departmentId = String(scope.get('departmentId') || '');
          const sectorId = String(scope.get('sectorId') || '');
          const postId = String(scope.get('postId') || '');
          const jurisdictionIds = scope.get('jurisdictionIds');
          if (!departmentId || !sectorId || !postId || !Array.isArray(jurisdictionIds) ||
              !jurisdictionIds.length || jurisdictionIds.length > 30) return false;
          const department = hierarchyByPath.get(this.db.collection('departments').doc(departmentId).path);
          const sector = hierarchyByPath.get(this.db.collection('sectors').doc(sectorId).path);
          const post = hierarchyByPath.get(this.db.collection('posts').doc(postId).path);
          if (!department?.exists || !sector?.exists || !post?.exists ||
              department.get('status') !== 'Active' || sector.get('status') !== 'Active' ||
              post.get('status') !== 'Active' || department.get('sectorId') !== sectorId ||
              post.get('departmentId') !== departmentId || post.get('sectorId') !== sectorId) return false;
          return jurisdictionIds.every(id => {
            if (typeof id !== 'string') return false;
            const jurisdiction = hierarchyByPath.get(this.db.collection('jurisdictions').doc(id).path);
            return !!jurisdiction?.exists && jurisdiction.get('status') === 'Active' &&
              jurisdiction.get('departmentId') === departmentId;
          });
        };
        if (!scopeIsCurrentAndActive(employee) || !scopeIsCurrentAndActive(actor)) return false;
        const inScope = employee.get('departmentId') === actor.get('departmentId') &&
          Array.isArray(targetJurisdictions) && targetJurisdictions.length > 0 &&
          Array.isArray(actorJurisdictions) && targetJurisdictions.every(id =>
            typeof id === 'string' && actorJurisdictions.includes(id));
        const actorPermissionSet = new Set(actorPermissions as PermissionId[]);
        const hasCrossScope = String(actor.get('primaryRole')).toLowerCase() === 'superadmin' &&
          actorPermissionSet.has('grievance.cross_scope') && actorPermissionSet.has('iam.employee.cross_scope');
        if (!inScope && !hasCrossScope) return false;
      const prior = await transaction.get(invitationRef);
      const invitationVersion = Number(prior.get('invitationVersion') || 0) + 1;
      transaction.set(invitationRef, {
        employeeId, tokenHash, status: 'Pending', invitationVersion,
        createdBy: actorUid, createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMilliseconds).toISOString(),
      });
      transaction.create(auditRef, {
        event: 'EMPLOYEE_INVITATION_ISSUED', userId: actorUid, employeeId,
        invitationVersion, timestamp: new Date(now).toISOString(),
      });
      return true;
    });
  }

  public static async consumeEmployeeInvitation(token: string): Promise<{ employeeId: string; email: string } | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const matches = await this.db.collection('employeeInvitations')
      .where('tokenHash', '==', tokenHash).where('status', '==', 'Pending').limit(2).get();
    if (matches.size !== 1) return null;
    const match = matches.docs[0];
    if (!match) return null;
    const invitationRef = match.ref;
    const employeeRef = this.db.collection('governmentEmployees').doc(match.id);
    const auditRef = this.db.collection('adminAuditLogs').doc();
    const now = Date.now();
    return this.db.runTransaction(async transaction => {
      const [invitation, employee] = await Promise.all([
        transaction.get(invitationRef), transaction.get(employeeRef),
      ]);
      const expiry = Date.parse(String(invitation.get('expiresAt') || ''));
      if (!invitation.exists || !employee.exists || invitation.get('status') !== 'Pending' ||
          invitation.get('tokenHash') !== tokenHash || !Number.isFinite(expiry) || expiry <= now ||
          invitation.get('employeeId') !== employee.id || employee.get('accountStatus') !== 'PendingActivation' ||
          typeof employee.get('email') !== 'string') return null;
      transaction.update(invitationRef, {
        status: 'Consumed', tokenHash: FieldValue.delete(), consumedAt: new Date(now).toISOString(),
      });
      transaction.create(auditRef, {
        event: 'EMPLOYEE_INVITATION_CONSUMED', employeeId: employee.id,
        invitationVersion: Number(invitation.get('invitationVersion') || 0),
        timestamp: new Date(now).toISOString(),
      });
      return { employeeId: employee.id, email: String(employee.get('email')) };
    });
  }

  public static async revokeEmployeeInvitation(employeeId: string, actorUid?: string): Promise<void> {
    const ref = this.db.collection('employeeInvitations').doc(employeeId);
    const auditRef = this.db.collection('adminAuditLogs').doc();
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.get('status') !== 'Pending') return;
      const now = new Date().toISOString();
      transaction.update(ref, { status: 'Revoked', tokenHash: FieldValue.delete(), revokedAt: now });
      transaction.create(auditRef, {
        event: 'EMPLOYEE_INVITATION_REVOKED', employeeId,
        ...(actorUid ? { userId: actorUid } : {}),
        invitationVersion: Number(snapshot.get('invitationVersion') || 0), timestamp: now,
      });
    });
  }

  public static async getGovernmentEmployee(employeeId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('governmentEmployees').doc(employeeId).get();
    return doc.exists ? { ...doc.data(), employeeId: doc.id } : null;
  }

  /** Resolve a staff principal from the UID-keyed employee record provisioned by this API. */
  public static async getGovernmentEmployeeForUid(uid: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('governmentEmployees').doc(uid).get();
    return doc.exists ? { ...doc.data(), employeeId: doc.id } : null;
  }

  public static async validateGovernmentEmployeeScope(employee: Record<string, unknown>): Promise<boolean> {
    const departmentId = typeof employee.departmentId === 'string' ? employee.departmentId : '';
    const sectorId = typeof employee.sectorId === 'string' ? employee.sectorId : '';
    const jurisdictionIds = Array.isArray(employee.jurisdictionIds)
      ? employee.jurisdictionIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (!departmentId || !sectorId || jurisdictionIds.length === 0 || jurisdictionIds.length > 30) return false;
    const postId = typeof employee.postId === 'string' ? employee.postId : '';
    if (!postId) return false;
    const [department, sector, post, ...jurisdictions] = await this.db.getAll(
      this.db.collection('departments').doc(departmentId),
      this.db.collection('sectors').doc(sectorId),
      this.db.collection('posts').doc(postId),
      ...jurisdictionIds.map(id => this.db.collection('jurisdictions').doc(id)),
    );
    if (!department?.exists || !sector?.exists || !post?.exists || jurisdictions.length !== jurisdictionIds.length) return false;
    if (department.get('sectorId') !== sectorId) return false;
    const departmentStatus = department.get('status');
    if (departmentStatus !== 'Active') return false;
    const sectorStatus = sector.get('status');
    if (sectorStatus !== 'Active') return false;
    if (post.get('departmentId') !== departmentId || post.get('sectorId') !== sectorId) return false;
    const postStatus = post.get('status');
    if (postStatus !== 'Active') return false;
    return jurisdictions.every(doc => {
      if (!doc.exists || doc.get('departmentId') !== departmentId) return false;
      const status = doc.get('status');
      return status === 'Active';
    });
  }

  /** Checks selected employee hierarchy IDs against their canonical parent links. */
  public static async validateEmployeeProvisioningScope(
    departmentId: string,
    sectorId: string,
    postId: string,
    jurisdictionIds: string[],
  ): Promise<boolean> {
    if (!departmentId || !sectorId || !postId || !jurisdictionIds.length || jurisdictionIds.length > 30 ||
        new Set(jurisdictionIds).size !== jurisdictionIds.length) return false;
    return this.validateGovernmentEmployeeScope({ departmentId, sectorId, postId, jurisdictionIds });
  }

  public static async updateEmployeePermissions(
    employeeId: string,
    actorUid: string,
    action: 'GRANT' | 'REVOKE',
    permissionIds: PermissionId[],
    reason: string,
  ): Promise<{ permissions: PermissionId[]; permissionVersion: number } | null> {
    const employeeRef = this.db.collection('governmentEmployees').doc(employeeId);
    const actorRef = this.db.collection('governmentEmployees').doc(actorUid);
    const auditRef = this.db.collection('adminAuditLogs').doc();
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      if (actorUid === employeeId) return null;
      const [snapshot, actor] = await Promise.all([
        transaction.get(employeeRef), transaction.get(actorRef),
      ]);
      if (!snapshot.exists || !actor.exists || actor.get('employeeId') !== actorUid ||
          actor.get('authProviderUid') !== actorUid || actor.get('accountStatus') !== 'Active' ||
          actor.get('identityVerificationStatus') !== 'Verified' ||
          !['DepartmentAdmin', 'SuperAdmin'].includes(String(actor.get('primaryRole')))) return null;
      const currentValue: unknown = snapshot.get('permissions') ?? [];
      if (!Array.isArray(currentValue) || currentValue.some(id => !isPermissionId(id))) {
        throw new Error('Target employee has malformed permissions; manual review is required.');
      }
      const actorValue: unknown = actor.get('permissions') ?? [];
      if (!Array.isArray(actorValue) || actorValue.some(id => !isPermissionId(id))) return null;
      const actorPermissions = new Set(actorValue as PermissionId[]);
      const requiredActionPermission = action === 'GRANT' ? 'iam.permissions.grant' : 'iam.permissions.revoke';
      if (!actorPermissions.has(requiredActionPermission) ||
          permissionIds.some(permission => !actorPermissions.has(permission))) return null;
      const sensitive = permissionIds.some(permission =>
        permission === 'grievance.cross_scope' || permission === 'iam.employee.cross_scope');
      if (sensitive && (String(actor.get('primaryRole')).toLowerCase() !== 'superadmin' ||
          !actorPermissions.has('grievance.cross_scope') || String(snapshot.get('primaryRole')).toLowerCase() !== 'superadmin')) return null;

      const targetJurisdictions: unknown = snapshot.get('jurisdictionIds');
      const actorJurisdictions: unknown = actor.get('jurisdictionIds');
      const inScope = snapshot.get('departmentId') === actor.get('departmentId') &&
        Array.isArray(targetJurisdictions) && targetJurisdictions.length > 0 &&
        Array.isArray(actorJurisdictions) && targetJurisdictions.every(id =>
          typeof id === 'string' && actorJurisdictions.includes(id));
      const hasCrossScope = String(actor.get('primaryRole')).toLowerCase() === 'superadmin' &&
        actorPermissions.has('grievance.cross_scope') && actorPermissions.has('iam.employee.cross_scope');
      if (!inScope && !hasCrossScope) return null;
      const current = new Set(currentValue as PermissionId[]);
      for (const permission of permissionIds) {
        if (action === 'GRANT') current.add(permission);
        else current.delete(permission);
      }
      const permissions = [...current].sort() as PermissionId[];
      const permissionVersion = Number(snapshot.get('permissionVersion') || 0) + 1;
      transaction.update(employeeRef, {
        permissions,
        permissionVersion,
        updatedAt: now,
        updatedBy: actorUid,
      });
      transaction.create(auditRef, {
        event: `EMPLOYEE_PERMISSION_${action}`,
        userId: actorUid,
        employeeId,
        permissionIds,
        permissionVersion,
        reason,
        timestamp: now,
      });
      return { permissions, permissionVersion };
    });
  }

  public static async resolveGrievanceRoutingMapping(
    stateCode: string,
    districtKey: string,
    categoryId: string,
  ): Promise<Record<string, unknown> | null> {
    const snapshot = await this.db.collection('grievanceRoutingMappings')
      .where('stateCode', '==', stateCode)
      .where('districtKey', '==', districtKey)
      .where('categoryId', '==', categoryId)
      .where('status', '==', 'Active')
      .limit(2).get();
    if (snapshot.size !== 1) return null;
    const doc = snapshot.docs[0];
    if (!doc) return null;
    const mapping = doc.data();
    if (typeof mapping.departmentId !== 'string' || typeof mapping.jurisdictionId !== 'string' ||
        !mapping.approvedBy || !mapping.approvedAt || !Number.isInteger(mapping.mappingVersion)) return null;
    const [department, jurisdiction, category] = await this.db.getAll(
      this.db.collection('departments').doc(mapping.departmentId),
      this.db.collection('jurisdictions').doc(mapping.jurisdictionId),
      this.db.collection('categories').doc(categoryId),
    );
    if (!department?.exists || !jurisdiction?.exists || !category?.exists ||
        jurisdiction.get('departmentId') !== mapping.departmentId ||
        category.get('categoryId') !== categoryId || category.get('status') !== 'Active' ||
        String(jurisdiction.get('stateCode') || '').toUpperCase() !== stateCode ||
        String(jurisdiction.get('districtName') || '').trim().toLowerCase().replace(/\s+/g, ' ') !== districtKey) return null;
    if (department.get('status') !== 'Active' || jurisdiction.get('status') !== 'Active') return null;
    return { mappingId: doc.id, ...mapping, departmentName: department.get('name') };
  }

  public static routingMappingDocumentId(stateCode: string, districtKey: string, categoryId: string): string {
    return createHash('sha256').update(`${stateCode}|${districtKey}|${categoryId}`).digest('hex');
  }

  public static async listRoutingTriage(limit: number, cursor?: string): Promise<{
    items: Record<string, unknown>[]; nextCursor?: string;
  }> {
    let query = this.db.collection('grievances')
      .where('routingStatus', '==', 'NeedsTriage')
      .orderBy('submittedAt', 'asc');
    if (cursor) {
      const cursorDoc = await this.db.collection('grievances').doc(cursor).get();
      if (!cursorDoc.exists || cursorDoc.get('routingStatus') !== 'NeedsTriage') {
        throw new Error('Invalid triage cursor.');
      }
      query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.limit(limit + 1).get();
    const page = snapshot.docs.slice(0, limit);
    return {
      items: page.map(doc => {
        const item = doc.data();
        return {
          id: doc.id, publicId: item.publicId, title: item.title, description: item.description,
          categorySuggestion: item.categoryId,
          district: item.location?.district, stateCode: item.location?.stateCode,
          routingStatus: item.routingStatus, submittedAt: item.submittedAt,
        };
      }),
      ...(snapshot.docs.length > limit && page.length ? { nextCursor: page[page.length - 1]!.id } : {}),
    };
  }

  public static async listActiveGrievanceCategories(): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('categories').where('status', '==', 'Active').limit(200).get();
    return snapshot.docs
      .filter(doc => doc.get('categoryId') === doc.id && typeof doc.get('name') === 'string')
      .map(doc => ({ categoryId: doc.id, name: doc.get('name'), ...(typeof doc.get('description') === 'string' ? { description: doc.get('description') } : {}) }));
  }

  public static async routeTriageGrievance(
    publicId: string,
    mappingId: string,
    categoryId: string,
    actorUid: string,
    reason: string,
  ): Promise<'ROUTED' | 'NOT_FOUND' | 'MAPPING_MISMATCH' | 'ALREADY_ROUTED'> {
    const grievanceRef = this.db.collection('grievances').doc(publicId);
    const mappingRef = this.db.collection('grievanceRoutingMappings').doc(mappingId);
    const timelineRef = grievanceRef.collection('timeline').doc();
    const auditRef = this.db.collection('adminAuditLogs').doc();
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const [grievanceDoc, mappingDoc] = await Promise.all([
        transaction.get(grievanceRef), transaction.get(mappingRef),
      ]);
      if (!grievanceDoc.exists) return 'NOT_FOUND';
      const grievance = grievanceDoc.data() || {};
      if (grievance.routingStatus !== 'NeedsTriage') return 'ALREADY_ROUTED';
      if (!mappingDoc.exists) return 'MAPPING_MISMATCH';
      const mapping = mappingDoc.data() || {};
      const stateCode = String(mapping.stateCode || '').trim().toUpperCase();
      const districtKey = String(mapping.districtKey || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (mapping.status !== 'Active' || !/^[A-Z]{2}$/.test(stateCode) || !districtKey ||
          mapping.categoryId !== categoryId || this.routingMappingDocumentId(stateCode, districtKey, categoryId) !== mappingId ||
          typeof mapping.departmentId !== 'string' || typeof mapping.jurisdictionId !== 'string' ||
          !mapping.approvedBy || !mapping.approvedAt || !Number.isInteger(mapping.mappingVersion) ||
          !['Low', 'Medium', 'High', 'Critical'].includes(String(mapping.priority)) ||
          !Number.isInteger(mapping.slaHours) || mapping.slaHours < 1 || mapping.slaHours > 8760) return 'MAPPING_MISMATCH';
      const [departmentDoc, jurisdictionDoc, categoryDoc] = await Promise.all([
        transaction.get(this.db.collection('departments').doc(mapping.departmentId)),
        transaction.get(this.db.collection('jurisdictions').doc(mapping.jurisdictionId)),
        transaction.get(this.db.collection('categories').doc(categoryId)),
      ]);
      if (!departmentDoc.exists || !jurisdictionDoc.exists || !categoryDoc.exists ||
          categoryDoc.get('categoryId') !== categoryId || categoryDoc.get('status') !== 'Active' ||
          jurisdictionDoc.get('departmentId') !== mapping.departmentId ||
          String(jurisdictionDoc.get('stateCode') || '').toUpperCase() !== stateCode ||
          String(jurisdictionDoc.get('districtName') || '').trim().toLowerCase().replace(/\s+/g, ' ') !== districtKey ||
          departmentDoc.get('status') !== 'Active' || jurisdictionDoc.get('status') !== 'Active') return 'MAPPING_MISMATCH';
      const deadline = new Date(Date.now() + mapping.slaHours * 3600 * 1000).toISOString();
      const version = Number(grievance.version || 0) + 1;
      transaction.update(grievanceRef, {
        departmentId: mapping.departmentId,
        jurisdictionId: mapping.jurisdictionId,
        department: departmentDoc.get('name') || mapping.departmentId,
        categoryId,
        priority: mapping.priority,
        slaHours: mapping.slaHours,
        'assignment.departmentName': departmentDoc.get('name') || mapping.departmentId,
        'assignment.slaHours': mapping.slaHours,
        'assignment.targetResponseAt': deadline,
        routingStatus: 'Routed', routedBy: actorUid, routedAt: now,
        routingReason: reason, mappingId, mappingVersion: mapping.mappingVersion,
        version, updatedAt: now,
      });
      transaction.create(timelineRef, {
        eventType: 'Routed', title: 'Grievance routed to the responsible department',
        description: 'A verified routing decision has been recorded.', actorUserId: actorUid,
        visibility: 'Citizen', createdAt: now,
      });
      transaction.create(auditRef, {
        event: 'GRIEVANCE_ROUTED_FROM_TRIAGE', userId: actorUid, publicId,
        departmentId: mapping.departmentId, jurisdictionId: mapping.jurisdictionId,
        categoryId, mappingId, mappingVersion: mapping.mappingVersion, reason, timestamp: now,
      });
      return 'ROUTED';
    });
  }

  public static async saveGrievanceRoutingMapping(
    input: Record<string, unknown>,
    actorUid: string,
  ): Promise<{ mappingId: string; mappingVersion: number }> {
    const stateCode = String(input.stateCode).toUpperCase();
    const districtKey = String(input.districtKey).trim().toLowerCase().replace(/\s+/g, ' ');
    const categoryId = String(input.categoryId).trim();
    const departmentId = String(input.departmentId);
    const jurisdictionId = String(input.jurisdictionId);
    const priority = String(input.priority);
    const slaHours = Number(input.slaHours);
    if (!['Low', 'Medium', 'High', 'Critical'].includes(priority) ||
        !Number.isInteger(slaHours) || slaHours < 1 || slaHours > 8760) {
      throw new Error('Routing mappings require an approved priority and SLA duration from 1 to 8760 hours.');
    }
    const mappingId = this.routingMappingDocumentId(stateCode, districtKey, categoryId);
    const [department, jurisdiction, category] = await this.db.getAll(
      this.db.collection('departments').doc(departmentId),
      this.db.collection('jurisdictions').doc(jurisdictionId),
      this.db.collection('categories').doc(categoryId),
    );
    if (!department?.exists || !jurisdiction?.exists || !category?.exists ||
        category.get('categoryId') !== categoryId || category.get('status') !== 'Active' ||
        jurisdiction.get('departmentId') !== departmentId ||
        String(jurisdiction.get('stateCode') || '').toUpperCase() !== stateCode ||
        String(jurisdiction.get('districtName') || '').trim().toLowerCase().replace(/\s+/g, ' ') !== districtKey ||
        department.get('status') !== 'Active' || jurisdiction.get('status') !== 'Active') {
      throw new Error('Routing mapping must reference an active department and its active jurisdiction.');
    }
    const ref = this.db.collection('grievanceRoutingMappings').doc(mappingId);
    const now = new Date().toISOString();
    let mappingVersion = 0;
    await this.db.runTransaction(async transaction => {
      const prior = await transaction.get(ref);
      mappingVersion = Number(prior.get('mappingVersion') || 0) + 1;
      transaction.set(ref, {
        stateCode, districtKey, districtName: String(input.districtName).trim(), categoryId,
        departmentId, jurisdictionId, priority, slaHours,
        approvedReason: String(input.reason).trim(),
        status: 'Active',
        mappingVersion,
        approvedBy: actorUid,
        approvedAt: now,
        updatedAt: now,
      });
      const auditRef = this.db.collection('adminAuditLogs').doc();
      transaction.create(auditRef, {
        event: prior.exists ? 'GRIEVANCE_ROUTING_MAPPING_UPDATED' : 'GRIEVANCE_ROUTING_MAPPING_CREATED',
        userId: actorUid, mappingId, departmentId, jurisdictionId, categoryId, stateCode, districtKey,
        timestamp: now,
      });
    });
    return { mappingId, mappingVersion };
  }

  public static async listGovernmentEmployees(filters: {
    departmentId?: string | undefined;
    sectorId?: string | undefined;
    jurisdictionIds?: string[] | undefined;
    search?: string | undefined;
  }): Promise<Record<string, unknown>[]> {
    let query: Query = this.db.collection('governmentEmployees');
    if (filters.departmentId) query = query.where('departmentId', '==', filters.departmentId);
    if (filters.sectorId) query = query.where('sectorId', '==', filters.sectorId);
    const snapshot = await query.limit(501).get();
    if (snapshot.size > 500) throw new Error('Employee result window exceeds 500 records; add a narrower filter.');
    let employees: Record<string, unknown>[] = snapshot.docs.map(doc => ({ ...doc.data(), employeeId: doc.id }));
    if (filters.departmentId) employees = employees.filter(e => e.departmentId === filters.departmentId);
    if (filters.sectorId) employees = employees.filter(e => e.sectorId === filters.sectorId);
    if (filters.jurisdictionIds) {
      const allowed = new Set(filters.jurisdictionIds);
      employees = employees.filter(employee => Array.isArray(employee.jurisdictionIds) &&
        employee.jurisdictionIds.length > 0 &&
        employee.jurisdictionIds.every(id => typeof id === 'string' && allowed.has(id)));
    }
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

  public static async listEmployeeAuditLogs(employeeId: string, limit = 50): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection('adminAuditLogs')
      .where('employeeId', '==', employeeId).limit(Math.min(Math.max(limit, 1), 100)).get();
    const records: Record<string, unknown>[] = snapshot.docs
      .map(doc => ({ auditId: doc.id, ...doc.data() }));
    return records
      .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
      .map(({ auditId, event, userId, timestamp, reason, evidenceReference, permissionIds, previousDepartmentId, newDepartmentId }) => ({
        auditId, event, actorUid: userId, timestamp,
        ...(typeof reason === 'string' ? { reason } : {}),
        ...(typeof evidenceReference === 'string' ? { evidenceReference } : {}),
        ...(Array.isArray(permissionIds) ? { permissionIds } : {}),
        ...(typeof previousDepartmentId === 'string' ? { previousDepartmentId } : {}),
        ...(typeof newDepartmentId === 'string' ? { newDepartmentId } : {}),
      }));
  }

  public static async listCollection(collection: string, filters: Record<string, string> = {}): Promise<Record<string, unknown>[]> {
    if (!['sectors', 'departments', 'posts', 'jurisdictions'].includes(collection)) {
      throw new Error('Unsupported hierarchy collection.');
    }
    let query: FirebaseFirestore.Query = this.db.collection(collection);
    for (const [field, value] of Object.entries(filters)) {
      if (!['sectorId', 'departmentId'].includes(field) || !value) continue;
      query = query.where(field, '==', value);
    }
    const snapshot = await query.limit(200).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
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
