/** REST endpoints for citizen grievances backed by Firestore. */
import { randomInt, randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../../iam/api/middlewares/authMiddleware';
import { PublicGrievanceIdGenerator } from '../../domain/services/PublicGrievanceIdGenerator';
import { PinoSecurityAuditLogger } from '../../../iam/infrastructure/logging/PinoSecurityAuditLogger';
import { FirestoreService } from '../../../../platform/firestore/FirestoreService';
import { AuthorizationAction, AuthorizationService } from '../../../../platform/authorization/AuthorizationService';

const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export class GrievanceController {
  public static async listTriage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.permissions?.includes('grievance.triage.read')) {
      res.status(403).json({ code: 'PermissionDenied', message: 'Routing triage access is not granted.' });
      return;
    }
    const limit = Number(req.query.limit ?? 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ code: 'InvalidLimit', message: 'limit must be an integer from 1 to 50.' });
      return;
    }
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const result = await FirestoreService.listRoutingTriage(limit, cursor);
    res.status(200).json(result);
  }

  public static async routeFromTriage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.permissions?.includes('grievance.triage.route')) {
      res.status(403).json({ code: 'PermissionDenied', message: 'Routing triage decisions are not granted.' });
      return;
    }
    const mappingId = req.body?.mappingId;
    const categoryId = req.body?.categoryId;
    const reason = req.body?.reason;
    if (typeof mappingId !== 'string' || !/^[a-f0-9]{64}$/.test(mappingId) ||
        typeof categoryId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(categoryId) ||
        typeof reason !== 'string' || reason.trim().length < 8 || reason.trim().length > 500) {
      res.status(400).json({ code: 'InvalidRoutingDecision', message: 'Provide a verified mapping, category, and an 8-500 character triage reason.' });
      return;
    }
    const result = await FirestoreService.routeTriageGrievance(
      String(req.params.id || ''), mappingId, categoryId, req.user!.uid, reason.trim(),
    );
    if (result === 'NOT_FOUND') {
      res.status(404).json({ code: 'NotFound', message: 'Grievance not found.' });
      return;
    }
    if (result === 'ALREADY_ROUTED') {
      res.status(409).json({ code: 'AlreadyRouted', message: 'This grievance has already been routed.' });
      return;
    }
    if (result === 'MAPPING_MISMATCH') {
      res.status(422).json({ code: 'RoutingMappingMismatch', message: 'The selected active mapping does not match this grievance location and confirmed category.' });
      return;
    }
    PinoSecurityAuditLogger.logSecurityEvent({
      event: 'GRIEVANCE_ROUTED_FROM_TRIAGE', userId: req.user!.uid,
      ipAddress: req.ip || 'unknown', userAgent: req.headers['user-agent'] || 'unknown',
      correlationId: req.correlationId, auditId: `audit-triage-${randomUUID()}`,
      details: { publicId: req.params.id, mappingId, categoryId },
    });
    res.status(200).json({ publicId: req.params.id, routingStatus: 'Routed' });
  }

  private static async loadAuthorized(
    req: AuthenticatedRequest,
    res: Response,
    id: string,
    action: AuthorizationAction,
  ): Promise<Record<string, any> | null> {
    const grievance = await FirestoreService.getGrievanceByPublicId(id);
    if (!grievance) {
      res.status(404).json({ code: 'NotFound', message: 'Grievance not found' });
      return null;
    }
    if (!AuthorizationService.allows(req, action, grievance)) {
      res.status(404).json({ code: 'NotFound', message: 'Grievance not found' });
      return null;
    }
    return grievance;
  }

  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!AuthorizationService.canCreateGrievance(req)) {
      res.status(403).json({ code: 'Forbidden', message: 'Only citizen accounts can submit grievances.' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const { title, description, categoryId, location, aiClassification, evidenceList } = body;
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
    if (aiClassification !== undefined && !isRecord(aiClassification)) {
      res.status(400).json({ code: 'InvalidClassification', message: 'AI output, when supplied, must be an object.' });
      return;
    }
    const aiSuggestion = isRecord(aiClassification) ? aiClassification : {};
    const confidence = aiSuggestion.confidence ?? aiSuggestion.confidenceScore;
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      res.status(400).json({ code: 'InvalidClassification', message: 'AI confidence must be between 0 and 1 when provided.' });
      return;
    }
    if (categoryId !== undefined && (!nonEmptyString(categoryId) || categoryId.trim().length > 80)) {
      res.status(400).json({ code: 'InvalidInput', message: 'categoryId must be a non-empty string up to 80 characters when provided.' });
      return;
    }

    const stateCode = location.stateCode.trim().toUpperCase();
    const district = location.district.trim();
    const publicId = PublicGrievanceIdGenerator.generate(stateCode, randomInt(10_000_000, 100_000_000));
    const submittedAt = new Date().toISOString();
    const citizenUserId = req.user!.uid;
    const citizenEmail = req.user!.email;
    const provider = typeof aiSuggestion.provider === 'string' ? aiSuggestion.provider.slice(0, 100) : undefined;
    const suggestedDepartment = nonEmptyString(aiSuggestion.department) ? aiSuggestion.department.trim().slice(0, 160) : undefined;
    const suggestedPriority = typeof aiSuggestion.priority === 'string' && VALID_PRIORITIES.has(aiSuggestion.priority)
      ? aiSuggestion.priority : undefined;
    const suggestedSlaHours = typeof aiSuggestion.slaHours === 'number' && Number.isInteger(aiSuggestion.slaHours) &&
      aiSuggestion.slaHours >= 1 && aiSuggestion.slaHours <= 8760 ? aiSuggestion.slaHours : undefined;
    const classification = {
      source: 'untrusted-client-suggestion',
      ...(provider ? { model: provider } : {}),
      ...(suggestedDepartment ? { suggestedDepartment } : {}),
      ...(suggestedPriority ? { suggestedPriority } : {}),
      ...(suggestedSlaHours ? { suggestedSlaHours } : {}),
      ...(typeof confidence === 'number' ? { confidence } : {}),
    };
    const grievance = {
      publicId,
      uuid: randomUUID(),
      title: title.trim(),
      description: description.trim(),
      department: 'Pending verified routing',
      ...(typeof categoryId === 'string' ? { categoryId } : {}),
      citizenUserId,
      citizenEmail,
      priority: 'Unclassified',
      state: 'Submitted',
      routingStatus: 'NeedsTriage' as const,
      version: 0,
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
      details: { publicId, routingStatus: 'NeedsTriage' },
    });

    res.status(201).json({
      ...grievance,
      message: 'Grievance submitted and queued for verified department routing.',
      attachments: attachments.map(({ fileName, contentType, data }) => ({ fileName, contentType, sizeBytes: data.length })),
      citizenEmail,
    });
  }

  public static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'grievance.read');
    if (grievance) res.status(200).json(grievance);
  }

  public static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!AuthorizationService.allows(req, 'grievance.list')) {
      res.status(403).json({ code: 'Forbidden', message: 'A verified grievance scope is required.' });
      return;
    }
    const requestedLimit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      res.status(400).json({ code: 'InvalidLimit', message: 'limit must be an integer from 1 to 100.' });
      return;
    }
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const result = req.user!.roleId.toLowerCase() === 'citizen'
      ? await FirestoreService.listCitizenGrievances(req.user!.uid, requestedLimit, cursor)
      : await FirestoreService.listScopedGrievances(req.user!.departmentId!, req.user!.jurisdictionIds || [], requestedLimit, cursor);
    const items = result.items.filter(item => AuthorizationService.allows(req, 'grievance.read', item));
    res.status(200).json({ items, total: items.length, nextCursor: result.nextCursor });
  }

  public static async getTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'timeline.read');
    if (!grievance) return;
    const events = await FirestoreService.listTimelineEvents(String(grievance.id || id));
    const publicEvents = events
      .filter(event => event.visibility === undefined || event.visibility === 'Citizen')
      .map(event => ({
        id: event.id,
        ...(typeof event.eventType === 'string' ? { eventType: event.eventType } : {}),
        ...(typeof event.title === 'string' ? { title: event.title } : {}),
        ...(typeof event.description === 'string' ? { description: event.description } : {}),
        ...(typeof event.createdAt === 'string' ? { createdAt: event.createdAt } : {}),
      }));
    res.status(200).json({ events: publicEvents });
  }

  public static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'comment.citizen.create');
    if (!grievance) return;
    const { message, visibility } = req.body as Record<string, unknown>;
    if (!nonEmptyString(message) || message.trim().length > 5000) {
      res.status(400).json({ code: 'InvalidComment', message: 'A comment of 1 to 5000 characters is required.' });
      return;
    }
    const safeVisibility = visibility === undefined ? 'Citizen' : visibility;
    if (safeVisibility !== 'Citizen' && safeVisibility !== 'Internal') {
      res.status(400).json({ code: 'InvalidComment', message: 'visibility must be Citizen or Internal.' });
      return;
    }
    const action = safeVisibility === 'Internal' ? 'comment.internal.create' : 'comment.citizen.create';
    if (!AuthorizationService.allows(req, action, grievance)) {
      res.status(403).json({ code: 'Forbidden', message: 'This account cannot create that comment type.' });
      return;
    }
    const documentId = String(grievance.id || id);
    const commentId = await FirestoreService.addGrievanceRecord(documentId, 'comments', {
      authorUserId: req.user!.uid,
      visibility: safeVisibility,
      message: message.trim(),
    });
    res.status(201).json({ commentId, authorUserId: req.user!.uid, visibility: safeVisibility, message: message.trim() });
  }

  public static async uploadAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'attachment.upload');
    if (!grievance) return;
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
    const item = await FirestoreService.addGrievanceAttachment(String(grievance.id || id), {
      fileName: fileName.trim().replace(/[\\/\u0000-\u001f]/g, '_'),
      contentType: String(contentType),
      data,
    });
    res.status(201).json(item);
  }

  public static async listAttachments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'attachment.read');
    if (!grievance) return;
    const attachments = await FirestoreService.listGrievanceAttachments(String(grievance.id || id));
    res.status(200).json({ items: attachments });
  }

  public static async submitFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    const grievance = await GrievanceController.loadAuthorized(req, res, id, 'feedback.create');
    if (!grievance) return;
    const { rating, feedbackText } = req.body as Record<string, unknown>;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        (feedbackText !== undefined && (typeof feedbackText !== 'string' || feedbackText.length > 5000))) {
      res.status(400).json({ code: 'InvalidFeedback', message: 'Rating must be 1 to 5; feedback must be 5000 characters or fewer.' });
      return;
    }
    const feedbackId = await FirestoreService.addGrievanceRecord(String(grievance.id || id), 'feedback', {
      citizenUserId: req.user!.uid,
      rating,
      ...(typeof feedbackText === 'string' ? { feedbackText: feedbackText.trim() } : {}),
    });
    res.status(201).json({ feedbackId, rating, ...(typeof feedbackText === 'string' ? { feedbackText: feedbackText.trim() } : {}), receivedAt: new Date().toISOString() });
  }
}
