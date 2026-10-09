/** REST endpoints for citizen grievances backed by Firestore. */
import { randomInt, randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { PublicGrievanceIdGenerator } from '../../domain/services/PublicGrievanceIdGenerator';
import { PinoSecurityAuditLogger } from '../../../iam/infrastructure/logging/PinoSecurityAuditLogger';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';

const STAFF_ROLES = new Set(['nodalofficer', 'departmentadmin', 'superadmin', 'governmentofficial']);
const VALID_STATES = new Set(['Submitted', 'UnderReview', 'InProgress', 'Resolved', 'Rejected', 'Closed']);
const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export class GrievanceController {
  private static async canAccess(req: AuthenticatedRequest, res: Response, id: string): Promise<boolean> {
    const grievance = await FirestoreService.getGrievanceByPublicId(id);
    if (!grievance) {
      res.status(404).json({ code: 'NotFound', message: 'Grievance not found' });
      return false;
    }
    const role = (req.user?.roleId || '').toLowerCase();
    const ownerId = grievance.citizenUserId || grievance.citizen?.uid;
    if (!STAFF_ROLES.has(role) && ownerId !== req.user?.uid) {
      res.status(404).json({ code: 'NotFound', message: 'Grievance not found' });
      return false;
    }
    return true;
  }

  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    const body = req.body as Record<string, unknown>;
    const { title, description, categoryId, department, slaHours, location, priority, aiClassification, evidenceList } = body;
    if (!nonEmptyString(title) || title.trim().length > 200 || !nonEmptyString(description) || description.trim().length > 10000) {
      res.status(400).json({ code: 'InvalidInput', message: 'A title (up to 200 characters) and description (up to 10000 characters) are required.' });
      return;
    }
    if (!isRecord(location) || !nonEmptyString(location.district) || !nonEmptyString(location.stateCode) || !/^[A-Za-z]{2}$/.test(location.stateCode.trim())) {
      res.status(400).json({ code: 'InvalidLocation', message: 'A valid state code and district are required.' });
      return;
    }
    if (evidenceList !== undefined && !Array.isArray(evidenceList)) {
      res.status(400).json({ code: 'InvalidEvidence', message: 'evidenceList must be an array.' });
      return;
    }
    const attachments: Array<{ fileName: string; contentType: string; data: Buffer }> = [];
    let totalEvidenceBytes = 0;
    if (Array.isArray(evidenceList)) {
      if (evidenceList.length > 5) {
        res.status(400).json({ code: 'InvalidEvidence', message: 'Up to five images can be attached to a grievance.' });
        return;
      }
      for (const item of evidenceList) {
        if (!isRecord(item) || !nonEmptyString(item.fileName) || item.fileName.length > 255 ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(String(item.contentType)) ||
            typeof item.dataBase64 !== 'string' || item.dataBase64.length > 1_048_576 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.dataBase64)) {
          res.status(400).json({ code: 'InvalidEvidence', message: 'An attached image is invalid or exceeds the 768 KB limit.' });
          return;
        }
        const data = Buffer.from(item.dataBase64, 'base64');
        if (data.length === 0 || data.length > 768 * 1024 || data.toString('base64') !== item.dataBase64) {
          res.status(400).json({ code: 'InvalidEvidence', message: 'An attached image is invalid or exceeds the 768 KB limit.' });
          return;
        }
        totalEvidenceBytes += data.length;
        if (totalEvidenceBytes > 3 * 1024 * 1024) {
          res.status(400).json({ code: 'InvalidEvidence', message: 'Total evidence per grievance cannot exceed 3 MB.' });
          return;
        }
        attachments.push({
          fileName: item.fileName.trim().replace(/[\\/\u0000-\u001f]/g, '_'),
          contentType: String(item.contentType),
          data,
        });
      }
    }
    if (!isRecord(aiClassification)) {
      res.status(400).json({ code: 'ClassificationRequired', message: 'A real AI classification is required before submission.' });
      return;
    }
    const provider = aiClassification.provider;
    const classifiedDepartment = aiClassification.department;
    const classifiedPriority = aiClassification.priority;
    const classifiedSla = aiClassification.slaHours;
    if (!nonEmptyString(provider) || !nonEmptyString(classifiedDepartment) ||
        typeof classifiedPriority !== 'string' || !VALID_PRIORITIES.has(classifiedPriority) || typeof classifiedSla !== 'number' ||
        !Number.isInteger(classifiedSla) || classifiedSla < 1 || classifiedSla > 8760 ||
        department !== classifiedDepartment || priority !== classifiedPriority || slaHours !== classifiedSla) {
      res.status(400).json({ code: 'InvalidClassification', message: 'Department, priority, SLA, and provider must match the AI classification.' });
      return;
    }
    const confidence = aiClassification.confidence ?? aiClassification.confidenceScore;
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      res.status(400).json({ code: 'InvalidClassification', message: 'AI confidence must be between 0 and 1 when provided.' });
      return;
    }
    if (categoryId !== undefined && !nonEmptyString(categoryId)) {
      res.status(400).json({ code: 'InvalidInput', message: 'categoryId must be a non-empty string when provided.' });
      return;
    }

    const stateCode = location.stateCode.trim().toUpperCase();
    const district = location.district.trim();
    const publicId = PublicGrievanceIdGenerator.generate(stateCode, randomInt(10_000_000, 100_000_000));
    const submittedAt = new Date().toISOString();
    const citizenUserId = req.user!.uid;
    const citizenEmail = req.user!.email;
    const classification = {
      ...aiClassification,
      model: provider,
      ...(typeof confidence === 'number' ? { confidence } : {}),
      department: classifiedDepartment,
    };
    const grievance = {
      publicId,
      uuid: randomUUID(),
      title: title.trim(),
      description: description.trim(),
      department: classifiedDepartment,
      ...(typeof categoryId === 'string' ? { categoryId } : {}),
      slaHours: classifiedSla,
      citizenUserId,
      citizenEmail,
      priority: classifiedPriority,
      state: 'Submitted',
      location: { ...location, district, stateCode, countryCode: 'IN' },
      aiClassification: classification,
      attachments,
      submittedAt,
    };

    await FirestoreService.createGrievance(grievance);
    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'Registration',
      userId: citizenUserId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId,
      auditId: req.auditId || `audit-grv-${randomUUID()}`,
      details: { publicId, department: classifiedDepartment },
    });

    res.status(201).json({
      ...grievance,
      attachments: attachments.map(({ fileName, contentType, data }) => ({ fileName, contentType, sizeBytes: data.length })),
      citizenEmail,
    });
  }

  public static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const found = await FirestoreService.getGrievanceByPublicId(id);
    if (found) res.status(200).json(found);
  }

  public static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    const cloudGrievances = await FirestoreService.listGrievances(req.user!.uid);
    res.status(200).json({ items: cloudGrievances, total: cloudGrievances.length, nextCursor: null });
  }

  public static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const role = (req.user?.roleId || '').toLowerCase();
    if (!STAFF_ROLES.has(role)) {
      res.status(403).json({ code: 'Forbidden', message: 'Only authorized staff can change grievance status.' });
      return;
    }
    const state = req.body?.state;
    if (!nonEmptyString(state) || !VALID_STATES.has(state)) {
      res.status(400).json({ code: 'InvalidState', message: 'A supported grievance state is required.' });
      return;
    }
    await FirestoreService.updateGrievanceStatus(id, state);
    await FirestoreService.addTimelineEvent(id, {
      eventType: state,
      title: `Status changed to ${state}`,
      actorUserId: req.user?.uid,
    });
    res.status(200).json({ publicId: id, state, updatedAt: new Date().toISOString() });
  }

  public static async getTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    res.status(200).json({ events: await FirestoreService.listTimelineEvents(id) });
  }

  public static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const { message, visibility } = req.body as Record<string, unknown>;
    if (!nonEmptyString(message) || message.trim().length > 5000) {
      res.status(400).json({ code: 'InvalidComment', message: 'A comment of 1 to 5000 characters is required.' });
      return;
    }
    const role = (req.user?.roleId || '').toLowerCase();
    const allowedVisibility = STAFF_ROLES.has(role) ? ['Citizen', 'Internal'] : ['Citizen'];
    const safeVisibility = typeof visibility === 'string' && allowedVisibility.includes(visibility) ? visibility : 'Citizen';
    const commentId = await FirestoreService.addGrievanceRecord(id, 'comments', {
      authorUserId: req.user!.uid,
      visibility: safeVisibility,
      message: message.trim(),
    });
    res.status(201).json({ commentId, authorUserId: req.user!.uid, visibility: safeVisibility, message: message.trim() });
  }

  public static async uploadAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const { fileName, contentType, dataBase64 } = req.body as Record<string, unknown>;
    if (!nonEmptyString(fileName) || fileName.length > 255 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(String(contentType)) ||
        typeof dataBase64 !== 'string' || dataBase64.length > 1_048_576 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) {
      res.status(400).json({ code: 'InvalidEvidence', message: 'A valid image up to 768 KB is required.' });
      return;
    }
    const data = Buffer.from(dataBase64, 'base64');
    if (data.length === 0 || data.length > 768 * 1024 || data.toString('base64') !== dataBase64) {
      res.status(400).json({ code: 'InvalidEvidence', message: 'A valid image up to 768 KB is required.' });
      return;
    }
    const item = await FirestoreService.addGrievanceAttachment(id, {
      fileName: fileName.trim().replace(/[\\/\u0000-\u001f]/g, '_'),
      contentType: String(contentType),
      data,
    });
    res.status(201).json(item);
  }

  public static async listAttachments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const attachments = await FirestoreService.listGrievanceAttachments(id);
    res.status(200).json({ items: attachments });
  }

  public static async submitFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!await GrievanceController.canAccess(req, res, id)) return;
    const { rating, feedbackText } = req.body as Record<string, unknown>;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        (feedbackText !== undefined && (typeof feedbackText !== 'string' || feedbackText.length > 5000))) {
      res.status(400).json({ code: 'InvalidFeedback', message: 'Rating must be 1 to 5; feedback must be 5000 characters or fewer.' });
      return;
    }
    const feedbackId = await FirestoreService.addGrievanceRecord(id, 'feedback', {
      citizenUserId: req.user!.uid,
      rating,
      ...(typeof feedbackText === 'string' ? { feedbackText: feedbackText.trim() } : {}),
    });
    res.status(201).json({ feedbackId, rating, ...(typeof feedbackText === 'string' ? { feedbackText: feedbackText.trim() } : {}), receivedAt: new Date().toISOString() });
  }
}
