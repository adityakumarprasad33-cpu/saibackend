const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const projectId = 'demo-samadhanai-security-test';
const authHost = '127.0.0.1:9099';
const firestoreHost = '127.0.0.1:8185';
const fixtureId = `security-${Date.now()}`;
const baseRecord = {
  publicId: `${fixtureId}-case-a`,
  uuid: `${fixtureId}-uuid-a`,
  title: 'Synthetic test grievance',
  description: 'Synthetic data only.',
  citizenUserId: `${fixtureId}-citizen-a`,
  citizen: { uid: `${fixtureId}-citizen-a` },
  departmentId: 'department-a',
  jurisdictionId: 'jurisdiction-a',
  state: 'Submitted',
  status: 'SUBMITTED',
  submittedAt: new Date().toISOString(),
  assignment: { departmentId: 'department-a' },
};

let app;
let adminApp;
let auth;
let db;
let server;
let origin;
const tokens = {};

function mustBeIsolated() {
  assert.equal(process.env.NODE_ENV, 'testing');
  assert.equal(process.env.FIREBASE_PROJECT_ID, projectId);
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, firestoreHost);
  assert.equal(process.env.FIREBASE_CLIENT_EMAIL === 'security-tests@demo.invalid', true,
    'test credentials must be synthetic and local-only');
  assert.equal(typeof process.env.FIREBASE_PRIVATE_KEY === 'string' && process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY'), true,
    'test private key must be generated at runtime');
  assert.equal(process.env.HMAC_SECRET === 'local-security-test-hmac-secret-not-for-production', true,
    'test HMAC key must be synthetic');
  for (const key of [
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    'GOOGLE_APPLICATION_CREDENTIALS', 'REDIS_URL', 'CLOUDINARY_API_SECRET', 'GEMINI_API_KEY',
  ]) assert.equal(process.env[key], undefined, `${key} must not be present in the test process`);
}

async function signIn(uid, role, scope = {}, employee = {}) {
  const password = 'Synthetic-Password-Not-Reused-987!';
  const email = `${uid}@example.invalid`;
  await auth.createUser({ uid, email, password, emailVerified: true });
  await auth.setCustomUserClaims(uid, {
    roleId: role,
    accountStatus: 'Active',
    ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
    ...(scope.sectorId ? { sectorId: scope.sectorId } : {}),
    ...(scope.jurisdictionIds ? { jurisdictionIds: scope.jurisdictionIds } : {}),
  });
  if (role !== 'Citizen') {
    await db.collection('governmentEmployees').doc(uid).set({
      employeeId: uid,
      authProviderUid: uid,
      primaryRole: role,
      accountStatus: 'Active',
      identityVerificationStatus: 'Verified',
      ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
      ...(scope.sectorId ? { sectorId: scope.sectorId } : {}),
      ...(scope.postId ? { postId: scope.postId } : {}),
      ...(scope.jurisdictionIds ? { jurisdictionIds: scope.jurisdictionIds } : {}),
      ...employee,
    });
  }
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(response.status, 200, 'synthetic test identity must sign in to the local Auth emulator');
  return (await response.json()).idToken;
}

async function signInExisting(uid) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.invalid`, password: 'Synthetic-Password-Not-Reused-987!', returnSecureToken: true }),
  });
  assert.equal(response.status, 200, 'synthetic identity must reauthenticate against local Auth emulator');
  return (await response.json()).idToken;
}

async function call(token, path, options = {}) {
  return fetch(`${origin}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.clientIp ? { 'x-test-client-ip': options.clientIp } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    ...(options.redirect ? { redirect: options.redirect } : {}),
  });
}

before(async () => {
  mustBeIsolated();
  ({ app } = require('../../dist/server.js'));
  ({ firebaseAdminApp: adminApp } = require('../../dist/platform/firebase/firebaseAdminApp.js'));
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  auth = getAuth(adminApp);
  db = getFirestore(adminApp);
  assert.equal(adminApp.options.projectId, projectId);

  await Promise.all([
    db.collection('departments').doc('department-a').set({ departmentId: 'department-a', sectorId: 'sector-a', status: 'Active' }),
    db.collection('departments').doc('department-b').set({ departmentId: 'department-b', sectorId: 'sector-b', status: 'Active' }),
    db.collection('sectors').doc('sector-a').set({ sectorId: 'sector-a', status: 'Active' }),
    db.collection('sectors').doc('sector-b').set({ sectorId: 'sector-b', status: 'Active' }),
    db.collection('posts').doc('post-a').set({ postId: 'post-a', departmentId: 'department-a', sectorId: 'sector-a', status: 'Active' }),
    db.collection('posts').doc('post-b').set({ postId: 'post-b', departmentId: 'department-b', sectorId: 'sector-b', status: 'Active' }),
    db.collection('jurisdictions').doc('jurisdiction-a').set({ departmentId: 'department-a', stateCode: 'ZZ', districtName: 'Synthetic District A', status: 'Active' }),
    db.collection('jurisdictions').doc('jurisdiction-c').set({ departmentId: 'department-a', stateCode: 'ZZ', districtName: 'Synthetic District C', status: 'Active' }),
    db.collection('jurisdictions').doc('jurisdiction-b').set({ departmentId: 'department-b', stateCode: 'ZZ', districtName: 'Synthetic District B', status: 'Active' }),
    db.collection('categories').doc('synthetic-category-a').set({ categoryId: 'synthetic-category-a', name: 'Synthetic category A', status: 'Active' }),
  ]);

  const citizenA = `${fixtureId}-citizen-a`;
  const citizenB = `${fixtureId}-citizen-b`;
  const staffA = `${fixtureId}-staff-a`;
  const staffB = `${fixtureId}-staff-b`;
  const staffC = `${fixtureId}-staff-c`;
  const staffD = `${fixtureId}-staff-d`;
  const staffE = `${fixtureId}-staff-e`;
  const staffF = `${fixtureId}-staff-f`;
  const staffG = `${fixtureId}-staff-g`;
  const adminA = `${fixtureId}-admin-a`;
  const adminMulti = `${fixtureId}-admin-multi`;
  const superAdmin = `${fixtureId}-superadmin`;
  tokens.citizenA = await signIn(citizenA, 'Citizen');
  tokens.citizenB = await signIn(citizenB, 'Citizen');
  tokens.staffA = await signIn(staffA, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'],
    postId: 'post-a',
  });
  tokens.staffB = await signIn(staffB, 'GovernmentOfficial', {
    departmentId: 'department-b', sectorId: 'sector-b', jurisdictionIds: ['jurisdiction-b'],
    postId: 'post-b',
  });
  tokens.staffC = await signIn(staffC, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-c'],
    postId: 'post-a',
  });
  tokens.staffD = await signIn(staffD, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'], postId: 'post-a',
  });
  tokens.staffE = await signIn(staffE, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'], postId: 'post-a',
  }, { accountStatus: 'PendingActivation', identityVerificationStatus: 'Unverified' });
  tokens.staffF = await signIn(staffF, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'], postId: 'post-a',
  }, { permissions: ['system.root'] });
  tokens.staffG = await signIn(staffG, 'GovernmentOfficial', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'], postId: 'post-a',
  }, { permissions: ['case.accept'] });
  tokens.adminA = await signIn(adminA, 'DepartmentAdmin', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a'], postId: 'post-a',
  }, { permissions: [
    'iam.permissions.grant', 'iam.permissions.revoke', 'iam.employee.list', 'iam.employee.invite', 'iam.employee.provision', 'iam.employee.transfer',
    'iam.employee.status.update', 'iam.employee.verify', 'case.accept',
    'case.investigate',
    'grievance.routing.manage', 'grievance.triage.read', 'grievance.triage.route',
  ] });
  tokens.adminMulti = await signIn(adminMulti, 'DepartmentAdmin', {
    departmentId: 'department-a', sectorId: 'sector-a', jurisdictionIds: ['jurisdiction-a', 'jurisdiction-c'], postId: 'post-a',
  }, { permissions: ['iam.employee.transfer'] });
  tokens.superAdmin = await signIn(superAdmin, 'SuperAdmin', {}, {
    permissions: ['grievance.cross_scope', 'grievance.read'],
  });

  await db.collection('grievances').doc(baseRecord.publicId).set(baseRecord);
  await db.collection('grievances').doc(`${fixtureId}-case-b`).set({
    ...baseRecord,
    publicId: `${fixtureId}-case-b`,
    uuid: `${fixtureId}-uuid-b`,
    citizenUserId: citizenB,
    citizen: { uid: citizenB },
    departmentId: 'department-b',
    jurisdictionId: 'jurisdiction-b',
  });
  await db.collection('grievances').doc(`${fixtureId}-race-case`).set({
    ...baseRecord,
    publicId: `${fixtureId}-race-case`,
    uuid: `${fixtureId}-race-uuid`,
  });
  await db.collection('grievances').doc(`${fixtureId}-legacy-case`).set({
    publicId: `${fixtureId}-legacy-case`,
    title: 'Synthetic legacy record missing trusted scope',
    citizenUserId: citizenA,
    state: 'Submitted',
  });
  const timeline = db.collection('grievances').doc(baseRecord.publicId).collection('timeline');
  await timeline.doc('public-event').set({ eventType: 'Submitted', title: 'Submitted', visibility: 'Citizen', createdAt: new Date().toISOString() });
  await timeline.doc('private-event').set({ eventType: 'Internal', title: 'Internal note', visibility: 'Internal', createdAt: new Date().toISOString() });
  await db.collection('grievances').doc(baseRecord.publicId).collection('attachments').doc('private-file').set({
    fileName: 'synthetic.png', contentType: 'image/png', storageRef: 'synthetic-only-storage-ref',
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (adminApp) await require('firebase-admin/app').deleteApp(adminApp);
});

test('rate guard ignores spoofed client-IP headers and fails closed without Netlify context', () => {
  const { resolveRateLimitClientIp } = require('../../dist/platform/rateguard/middleware/rateGuardMiddleware.js');
  const priorNodeEnv = process.env.NODE_ENV;
  const priorNetlify = process.env.NETLIFY;
  process.env.NODE_ENV = 'production';
  const request = {
    ip: '127.0.0.9',
    headers: {
      'x-nf-client-connection-ip': '203.0.113.44',
      'x-forwarded-for': '203.0.113.45',
      'x-test-client-ip': '203.0.113.46',
    },
  };
  try {
    process.env.NETLIFY = 'false';
    assert.equal(resolveRateLimitClientIp(request), '127.0.0.9',
      'non-Netlify requests use the Express peer IP and ignore all caller-supplied IP headers');
    process.env.NETLIFY = 'true';
    assert.equal(resolveRateLimitClientIp(request), null,
      'a missing trusted Netlify invocation context fails closed instead of falling back to spoofable headers or shared IP');
    process.env.NODE_ENV = 'testing';
    assert.equal(resolveRateLimitClientIp(request), null,
      'the test-only IP override is disabled when running in Netlify, even if NODE_ENV is misconfigured');
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    if (priorNetlify === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = priorNetlify;
  }
});

test('HTTP authorization blocks cross-owner and cross-scope access before child/storage reads', async () => {
  const path = `/api/v1/grievances/${baseRecord.publicId}`;
  assert.equal((await call(null, path)).status, 401, 'missing token is denied');
  assert.equal((await call('not-a-valid-id-token', path)).status, 401, 'malformed token is denied');

  assert.equal((await call(tokens.citizenA, path)).status, 200, 'owner can read their grievance');
  assert.equal((await call(tokens.citizenB, path)).status, 404, 'another citizen cannot read the grievance');
  const foreignDepartment = await call(tokens.staffB, path);
  assert.equal(foreignDepartment.status, 404, `another department cannot read the grievance: ${await foreignDepartment.text()}`);
  assert.equal((await call(tokens.staffC, path)).status, 404, 'another jurisdiction cannot read the grievance');
  assert.equal((await call(tokens.staffA, path)).status, 200, 'active in-scope staff can read canonical scope data');
  assert.equal((await call(tokens.staffA, `/api/v1/grievances/${fixtureId}-legacy-case`)).status, 404,
    'legacy record missing department and jurisdiction fails closed for staff');
  assert.equal((await call(tokens.citizenA, `/api/v1/grievances/${fixtureId}-legacy-case`)).status, 200,
    'citizen can still read their own legacy record when ownership is trustworthy');
  assert.equal((await call(tokens.superAdmin, path)).status, 200, 'explicitly granted SuperAdmin read works');

  const deniedAttachments = await call(tokens.citizenB, `${path}/attachments`);
  assert.equal(deniedAttachments.status, 404, 'foreign attachment access is hidden before storage signing');
  assert.doesNotMatch(await deniedAttachments.text(), /downloadUrl|signed/i);
  assert.equal((await call(tokens.staffC, `${path}/timeline`)).status, 404, 'wrong-jurisdiction timeline access is denied');

  const ownerTimeline = await call(tokens.citizenA, `${path}/timeline`);
  assert.equal(ownerTimeline.status, 200);
  const timelineBody = await ownerTimeline.json();
  assert.deepEqual(timelineBody.events.map(event => event.id), ['public-event'], JSON.stringify(timelineBody));

  const ownerComment = await call(tokens.citizenA, `${path}/comments`, {
    method: 'POST', body: { message: 'Synthetic owner comment', visibility: 'Citizen' },
  });
  assert.equal(ownerComment.status, 201, 'owner can create a citizen-visible comment');
  assert.equal((await call(tokens.citizenB, `${path}/comments`, {
    method: 'POST', body: { message: 'Forged owner', citizenUserId: baseRecord.citizenUserId },
  })).status, 404, 'caller-supplied owner data does not authorize foreign comment');
  assert.equal((await call(tokens.citizenA, path, {
    method: 'PATCH', body: { state: 'Closed', citizenUserId: tokens.citizenB },
  })).status, 404, 'citizen cannot mutate workflow status or ownership');
  assert.equal((await call(tokens.citizenA, `${path}/feedback`, {
    method: 'POST', body: { rating: 5, feedbackText: 'Too early' },
  })).status, 404, 'citizen feedback is unavailable before resolution/closure');
  assert.equal((await call(tokens.citizenA, `${path}/comments`, {
    method: 'POST', body: { message: 'Synthetic internal note', visibility: 'Internal' },
  })).status, 403, 'citizen cannot set a comment to Internal visibility');

  const acceptPath = '/api/v1/cases/accept';
  const genericPatch = await call(tokens.staffA, path, {
    method: 'PATCH', body: { state: 'Closed' },
  });
  assert.equal(genericPatch.status, 404, 'generic grievance PATCH cannot bypass action-specific workflow permissions');
  const forbiddenAccept = await call(tokens.staffA, acceptPath, {
    method: 'POST', body: { grievanceUuid: baseRecord.uuid },
  });
  assert.equal(forbiddenAccept.status, 404, 'staff workflow is denied until the current record grants that exact action');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('state'), 'Submitted', 'denied request did not mutate state');

  const staffAId = `${fixtureId}-staff-a`;
  await db.collection('governmentEmployees').doc(staffAId).update({
    permissions: ['case.accept', 'case.assign', 'case.reassign', 'case.investigate', 'case.resolve', 'case.close'],
  });
  const accepted = await call(tokens.staffA, acceptPath, {
    method: 'POST', body: { grievanceUuid: baseRecord.uuid },
  });
  assert.equal(accepted.status, 200, 'explicit action permission allows the in-scope workflow');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('state'), 'UnderReview');

  const raceResponses = await Promise.all([
    call(tokens.staffA, acceptPath, { method: 'POST', body: { grievanceUuid: `${fixtureId}-race-uuid` } }),
    call(tokens.staffA, acceptPath, { method: 'POST', body: { grievanceUuid: `${fixtureId}-race-uuid` } }),
  ]);
  assert.deepEqual(raceResponses.map(response => response.status).sort(), [200, 409],
    'concurrent duplicate acceptance must commit once and reject the stale retry');
  const raceDoc = await db.collection('grievances').doc(`${fixtureId}-race-case`).get();
  assert.equal(raceDoc.get('state'), 'UnderReview');
  assert.equal(raceDoc.get('version'), 1, 'workflow transaction increments the version once');
  const raceTimeline = await db.collection('grievances').doc(`${fixtureId}-race-case`).collection('timeline')
    .where('eventType', '==', 'UnderReview').get();
  assert.equal(raceTimeline.size, 1, 'workflow state and timeline event commit exactly once');

  const { FirestoreService } = require('../../dist/platform/firestore/FirestoreService.js');
  const staffDId = `${fixtureId}-staff-d`;
  await db.collection('governmentEmployees').doc(staffDId).update({ permissions: ['case.accept'] });
  await db.collection('governmentEmployees').doc(staffDId).update({ permissions: [] });
  const staleAuthorizationCommit = await FirestoreService.commitGrievanceWorkflow(
    `${fixtureId}-race-case`, 'Submitted', 0,
    { state: 'UnderReview', status: 'UnderReview' },
    { eventType: 'UnderReview', title: 'Should not commit after revoke', actorUserId: staffDId },
    { actorUid: staffDId, permission: 'case.accept' },
  );
  assert.equal(staleAuthorizationCommit, false, 'workflow transaction rechecks live actor permission after prior authorization');
  assert.equal((await db.collection('grievances').doc(`${fixtureId}-race-case`).get()).get('state'), 'UnderReview');

  const invalidAssignment = await call(tokens.staffA, '/api/v1/cases/assign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: `${fixtureId}-missing-officer` },
  });
  assert.equal(invalidAssignment.status, 400, 'missing target officer is rejected');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('state'), 'UnderReview',
    'invalid target performs no case state mutation');
  const wrongScopeAssignment = await call(tokens.staffA, '/api/v1/cases/assign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: `${fixtureId}-staff-b` },
  });
  assert.equal(wrongScopeAssignment.status, 400, 'active officer in another department cannot be assigned this case');
  const wrongJurisdictionAssignment = await call(tokens.staffA, '/api/v1/cases/assign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: `${fixtureId}-staff-c` },
  });
  assert.equal(wrongJurisdictionAssignment.status, 400, 'active officer in another jurisdiction cannot be assigned this case');
  const inactiveOfficerId = `${fixtureId}-inactive-officer`;
  await db.collection('governmentEmployees').doc(inactiveOfficerId).set({
    employeeId: inactiveOfficerId,
    authProviderUid: inactiveOfficerId,
    primaryRole: 'GovernmentOfficial',
    accountStatus: 'Suspended',
    identityVerificationStatus: 'Verified',
    departmentId: 'department-a',
    sectorId: 'sector-a',
    postId: 'post-a',
    jurisdictionIds: ['jurisdiction-a'],
  });
  const inactiveAssignment = await call(tokens.staffA, '/api/v1/cases/assign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: inactiveOfficerId },
  });
  assert.equal(inactiveAssignment.status, 400, 'suspended officer cannot be assigned a case');
  const unchangedAfterInvalidTargets = await db.collection('grievances').doc(baseRecord.publicId).get();
  assert.equal(unchangedAfterInvalidTargets.get('state'), 'UnderReview');
  assert.equal(unchangedAfterInvalidTargets.get('assignment.assignedOfficerId'), undefined);
  const validAssignment = await call(tokens.staffA, '/api/v1/cases/assign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: `${fixtureId}-staff-a` },
  });
  assert.equal(validAssignment.status, 200, 'active same-scope assignment target is accepted');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('state'), 'Assigned');

  const workload = await call(tokens.staffA, '/api/v1/officers/workload');
  assert.equal(workload.status, 200, 'officer workload uses the current employee and scoped case query');
  const workloadBody = await workload.json();
  assert.equal(workloadBody.activeCases, 1);
  assert.equal(workloadBody.queues.assigned, 1);

  const list = await call(tokens.staffA, '/api/v1/cases?limit=10');
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.deepEqual(new Set(listBody.items.map(item => item.publicId)), new Set([baseRecord.publicId, `${fixtureId}-race-case`]),
    'case list returns only department/jurisdiction scoped records');

  const metrics = await call(tokens.staffA, '/api/v1/cases/dashboard/metrics');
  assert.equal(metrics.status, 200, 'scoped dashboard metrics are available');
  assert.equal((await metrics.json()).openCases, 2);

  const investigate = await call(tokens.staffA, '/api/v1/cases/investigate', {
    method: 'POST', body: { caseId: baseRecord.publicId, note: 'Synthetic investigation inspection started' },
  });
  assert.equal(investigate.status, 200, 'the assigned verified officer can start investigation with exact permission');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('state'), 'InProgress');

  const reassign = await call(tokens.staffA, '/api/v1/cases/reassign', {
    method: 'POST', body: { caseId: baseRecord.publicId, officerId: `${fixtureId}-staff-d`, reason: 'Synthetic workload rebalance' },
  });
  assert.equal(reassign.status, 200);
  const resolve = await call(tokens.staffA, '/api/v1/cases/resolve', {
    method: 'POST', body: { caseId: baseRecord.publicId, summary: 'Synthetic resolution proposal' },
  });
  assert.equal(resolve.status, 200);
  const close = await call(tokens.staffA, '/api/v1/cases/close', {
    method: 'POST', body: { caseId: baseRecord.publicId, reason: 'Synthetic closure' },
  });
  assert.equal(close.status, 200);
  const workflowEvents = await db.collection('grievances').doc(baseRecord.publicId).collection('timeline')
    .where('actorUserId', '==', staffAId).get();
  assert.equal(workflowEvents.size, 6, 'accept/assign/investigate/reassign/resolve/close each write one atomic event');
  assert.equal((await db.collection('grievances').doc(baseRecord.publicId).get()).get('version'), 6);
  assert.equal((await call(tokens.citizenA, `${path}/feedback`, {
    method: 'POST', body: { rating: 5, feedbackText: 'Synthetic completed feedback' },
  })).status, 201, 'owner can submit feedback after closure');
  assert.equal((await call(tokens.citizenB, `${path}/feedback`, {
    method: 'POST', body: { rating: 1, feedbackText: 'Foreign feedback' },
  })).status, 404, 'non-owner cannot submit grievance feedback');
});

test('current employee status and scope override stale token privileges', async () => {
  const staffAId = `${fixtureId}-staff-a`;
  await db.collection('governmentEmployees').doc(staffAId).update({ accountStatus: 'Suspended' });
  const response = await call(tokens.staffA, `/api/v1/grievances/${baseRecord.publicId}`);
  assert.equal(response.status, 403, 'suspended employee denied despite active token claim');
  await db.collection('governmentEmployees').doc(staffAId).update({
    accountStatus: 'Active', departmentId: 'department-b',
  });
  const transferred = await call(tokens.staffA, `/api/v1/grievances/${baseRecord.publicId}`);
  assert.equal(transferred.status, 403, 'stale token scope mismatch is denied');
});

test('organization lookup responses stay within the caller scope and respect requested filters', async () => {
  const departments = await call(tokens.adminA, '/api/v1/hierarchy/departments?sectorId=sector-b', { clientIp: '198.51.100.51' });
  assert.equal(departments.status, 200);
  assert.deepEqual((await departments.json()).items.map(item => item.departmentId), ['department-a']);
  const posts = await call(tokens.adminA, '/api/v1/hierarchy/posts?departmentId=department-b', { clientIp: '198.51.100.52' });
  assert.equal(posts.status, 200);
  assert.deepEqual((await posts.json()).items.map(item => item.postId), ['post-a']);
  const jurisdictions = await call(tokens.adminA, '/api/v1/hierarchy/jurisdictions?departmentId=department-b', { clientIp: '198.51.100.53' });
  assert.equal(jurisdictions.status, 200);
  assert.deepEqual((await jurisdictions.json()).items.map(item => item.id), ['jurisdiction-a']);
});

test('Firebase sync returns only currently verified backend roles and permissions', async () => {
  const staffId = `${fixtureId}-staff-d`;
  const staffSync = await call(null, '/api/v1/auth/firebase-sync', {
    method: 'POST', body: {
      firebaseUid: staffId, email: `${staffId}@example.invalid`, idToken: tokens.staffD,
    },
  });
  assert.equal(staffSync.status, 200);
  const staffBody = await staffSync.json();
  assert.equal(staffBody.user.roleId, 'GovernmentOfficial');
  assert.deepEqual(staffBody.user.permissions, []);
  assert.equal(staffBody.user.departmentId, 'department-a');
  assert.deepEqual(staffBody.user.jurisdictionIds, ['jurisdiction-a']);

  const unverifiedId = `${fixtureId}-staff-e`;
  const unverifiedSync = await call(null, '/api/v1/auth/firebase-sync', {
    method: 'POST', body: {
      firebaseUid: unverifiedId, email: `${unverifiedId}@example.invalid`, idToken: tokens.staffE,
    },
  });
  assert.equal(unverifiedSync.status, 403, 'sync cannot send unverified employees to privileged UI screens');

  const malformedId = `${fixtureId}-staff-f`;
  const malformedSync = await call(null, '/api/v1/auth/firebase-sync', {
    method: 'POST', body: {
      firebaseUid: malformedId, email: `${malformedId}@example.invalid`, idToken: tokens.staffF,
    },
  });
  assert.equal(malformedSync.status, 403, 'sync rejects unsupported permission IDs');

  const citizenId = `${fixtureId}-citizen-a`;
  const citizenSync = await call(null, '/api/v1/auth/firebase-sync', {
    method: 'POST', body: {
      firebaseUid: citizenId, email: `${citizenId}@example.invalid`, idToken: tokens.citizenA,
    },
  });
  assert.equal(citizenSync.status, 200);
  assert.equal((await citizenSync.json()).user.roleId, 'Citizen');
});

test('permission grants are allowlisted, scoped, auditable, revocable, and cannot self-escalate', async () => {
  const adminId = `${fixtureId}-admin-a`;
  const targetId = `${fixtureId}-staff-d`;
  const selfGrant = await call(tokens.adminA, `/api/v1/admin/government-employees/${adminId}/permissions/grant`, {
    method: 'POST', body: { permissionIds: ['case.resolve'], reason: 'Synthetic self escalation attempt' },
  });
  assert.equal(selfGrant.status, 400, `requester cannot modify their own permissions: ${await selfGrant.text()}`);

  const unknown = await call(tokens.adminA, `/api/v1/admin/government-employees/${targetId}/permissions/grant`, {
    method: 'POST', body: { permissionIds: ['system.root'], reason: 'Synthetic unknown permission' },
  });
  assert.equal(unknown.status, 400, 'unknown permissions are rejected by the server catalog');

  const outOfScope = await call(tokens.adminA, `/api/v1/admin/government-employees/${fixtureId}-staff-c/permissions/grant`, {
    method: 'POST', body: { permissionIds: ['case.accept'], reason: 'Synthetic cross-jurisdiction attempt' },
  });
  assert.equal(outOfScope.status, 404, 'DepartmentAdmin cannot manage an employee outside their jurisdictions');

  const grant = await call(tokens.adminA, `/api/v1/admin/government-employees/${targetId}/permissions/grant`, {
    method: 'POST', body: { permissionIds: ['case.accept'], reason: 'Approved synthetic role assignment' },
  });
  assert.equal(grant.status, 200);
  const targetDoc = db.collection('governmentEmployees').doc(targetId);
  assert.deepEqual((await targetDoc.get()).get('permissions'), ['case.accept']);
  assert.equal((await targetDoc.get()).get('permissionVersion'), 1);
  const audit = await db.collection('adminAuditLogs').where('employeeId', '==', targetId)
    .where('event', '==', 'EMPLOYEE_PERMISSION_GRANT').get();
  assert.equal(audit.size, 1, 'the permission grant is durably audited in the same Firestore transaction');

  const escalation = await call(tokens.adminA, `/api/v1/admin/government-employees/${targetId}/permissions/grant`, {
    method: 'POST', body: { permissionIds: ['case.close'], reason: 'Synthetic authority escalation attempt' },
  });
  assert.equal(escalation.status, 403, 'grantor cannot delegate a permission they do not hold');

  const revoke = await call(tokens.adminA, `/api/v1/admin/government-employees/${targetId}/permissions/revoke`, {
    method: 'POST', body: { permissionIds: ['case.accept'], reason: 'Synthetic authorization revoked' },
  });
  assert.equal(revoke.status, 200);
  assert.deepEqual((await targetDoc.get()).get('permissions'), []);
  assert.equal((await targetDoc.get()).get('permissionVersion'), 2);
  const acceptDenied = await call(tokens.staffD, '/api/v1/cases/accept', {
    method: 'POST', body: { grievanceUuid: `${fixtureId}-race-uuid` },
  });
  assert.equal(acceptDenied.status, 404, 'permission revocation takes effect without waiting for token expiry');
  const administratorRef = db.collection('governmentEmployees').doc(`${fixtureId}-admin-a`);
  const originalAdministrator = (await administratorRef.get()).data();
  await administratorRef.update({ permissions: [] });
  const transactionDeniesRevokedGrantAuthority = await require('../../dist/platform/firestore/FirestoreService.js')
    .FirestoreService.updateEmployeePermissions(targetId, `${fixtureId}-admin-a`, 'GRANT', ['case.accept'],
      'Synthetic live authority recheck');
  assert.equal(transactionDeniesRevokedGrantAuthority, null,
    'permission transaction rechecks current grant authority inside the write transaction');
  await administratorRef.update({ permissions: originalAdministrator.permissions });

  const auditRead = await call(tokens.adminA, '/api/v1/admin/audit-logs');
  assert.equal(auditRead.status, 403, 'DepartmentAdmin cannot read the global audit feed');
  const directory = await call(tokens.adminA, '/api/v1/admin/government-employees');
  assert.equal(directory.status, 200);
  const directoryBody = await directory.json();
  const visibleTarget = directoryBody.items.find(item => item.employeeId === targetId);
  assert.ok(visibleTarget, 'DepartmentAdmin sees personnel inside the authorized jurisdiction');
  assert.equal(visibleTarget.permissions, undefined, 'employee directory does not disclose permission grants');
});

test('employee invitations are delivered privately, generic on resend, and contain no link in responses or audit history', async () => {
  const { EmployeeInvitationMailer } = require('../../dist/features/iam/infrastructure/EmployeeInvitationMailer.js');
  const sent = [];
  const priorPageUrl = process.env.EMPLOYEE_INVITATION_PAGE_URL;
  process.env.EMPLOYEE_INVITATION_PAGE_URL = 'http://127.0.0.1:5000/employee-invitation.html';
  EmployeeInvitationMailer.setTestSender(async message => sent.push(message));
  const email = `${fixtureId}-invite@example.invalid`;
  try {
    const response = await call(tokens.adminA, '/api/v1/admin/government-employees', {
      method: 'POST', body: {
        fullName: 'Synthetic Invitee', employeeCode: `${fixtureId}-invite-code`, email,
        sectorId: 'sector-a', departmentId: 'department-a', postId: 'post-a',
        jurisdictionIds: ['jurisdiction-a'], role: 'GovernmentOfficial',
      },
    });
    const bodyText = await response.text();
    assert.equal(response.status, 201, bodyText);
    assert.doesNotMatch(bodyText, /activationLink|oobCode|resetPassword|firebaseapp\.com\/__/i,
      'provision response must never disclose an activation token/link');
    const body = JSON.parse(bodyText);
    const employeeId = body.employee.employeeId;
    assert.equal(body.employee.accountStatus, 'PendingActivation');
    assert.equal(sent.length, 1);
    const jurisdictionRef = db.collection('jurisdictions').doc('jurisdiction-a');
    const priorJurisdiction = (await jurisdictionRef.get()).data();
    await jurisdictionRef.update({ status: 'Inactive' });
    const racedIssue = await require('../../dist/platform/firestore/FirestoreService.js')
      .FirestoreService.issueEmployeeInvitation(
        employeeId, 'synthetic-token-after-hierarchy-deactivation', `${fixtureId}-admin-a`, 'iam.employee.invite',
      );
    assert.equal(racedIssue, false, 'invitation transaction rejects a target scope deactivated after provisioning');
    await jurisdictionRef.set(priorJurisdiction);
    const firstUrl = new URL(sent[0].invitationUrl);
    assert.equal(firstUrl.hash.length, 44, 'email link carries a 256-bit fragment token');
    const firstToken = firstUrl.hash.slice(1);
    assert.equal((await db.collection('employeeInvitations').doc(employeeId).get()).get('tokenHash'),
      require('node:crypto').createHash('sha256').update(firstToken).digest('hex'), 'only a SHA-256 token hash is persisted');
    const expiry = Date.parse((await db.collection('employeeInvitations').doc(employeeId).get()).get('expiresAt'));
    assert.ok(expiry > Date.now() && expiry <= Date.now() + 60 * 60 * 1000, 'invitation expires within one hour');
    assert.equal(new URL(sent[0].invitationUrl).search, '', 'token is not placed in the URL path or query');
    assert.equal(bodyText.includes(firstToken), false, 'provision response excludes the invitation token');
    assert.equal(sent[0].recipient, email);

    const resend = await call(tokens.adminA, `/api/v1/admin/government-employees/${employeeId}/invitation`, { method: 'POST' });
    assert.equal(resend.status, 202);
    const resendBody = await resend.text();
    assert.doesNotMatch(resendBody, /activationLink|oobCode|resetPassword|firebaseapp\.com\/__/i);
    assert.equal(sent.length, 2);
    const replayedOld = await call(null, '/api/v1/auth/employee-invitations/consume', {
      method: 'POST', body: { token: firstToken }, redirect: 'manual',
    });
    assert.equal(replayedOld.status, 410, 'resending invalidates any previous invitation token');
    const activeToken = new URL(sent[1].invitationUrl).hash.slice(1);
    const consume = await call(null, '/api/v1/auth/employee-invitations/consume', {
      method: 'POST', body: { token: activeToken }, redirect: 'manual',
    });
    assert.equal(consume.status, 303, 'valid invitation is consumed then redirected to Firebase password setup');
    assert.match(consume.headers.get('location'), /mode=resetPassword/);
    assert.doesNotMatch(await consume.text(), /oobCode|activationLink|resetPassword/i,
      'Firebase action URL is not returned in a JSON response body');
    const replayed = await call(null, '/api/v1/auth/employee-invitations/consume', {
      method: 'POST', body: { token: activeToken }, redirect: 'manual',
    });
    assert.equal(replayed.status, 410, 'invitation token cannot be consumed twice');

    const thirdInvite = await call(tokens.adminA, `/api/v1/admin/government-employees/${employeeId}/invitation`, { method: 'POST' });
    assert.equal(thirdInvite.status, 202);
    assert.equal(sent.length, 3);
    const expiredToken = new URL(sent[2].invitationUrl).hash.slice(1);
    await db.collection('employeeInvitations').doc(employeeId).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const expired = await call(null, '/api/v1/auth/employee-invitations/consume', {
      method: 'POST', body: { token: expiredToken }, redirect: 'manual',
    });
    assert.equal(expired.status, 410, 'server-enforced expiry rejects stale invitation tokens');

    const denied = await call(tokens.staffA, `/api/v1/admin/government-employees/${employeeId}/invitation`, { method: 'POST' });
    assert.equal(denied.status, 403, 'employee lacking invitation permission cannot trigger delivery');
    assert.equal(sent.length, 3, 'unauthorized caller did not cause an email');

    const history = await call(tokens.adminA, `/api/v1/admin/government-employees/${employeeId}/audit-history`);
    assert.equal(history.status, 200);
    const auditText = await history.text();
    assert.match(auditText, /GOVERNMENT_EMPLOYEE_INVITATION_(SENT|RESENT)/);
    assert.doesNotMatch(auditText, /oobCode|activationLink|resetPassword|firebaseapp\.com\/__/i,
      'audit history must not contain activation tokens');
    assert.equal(auditText.includes(new URL(sent[0].invitationUrl).hash.slice(1)), false);

    const failEmail = `${fixtureId}-invite-fail@example.invalid`;
    EmployeeInvitationMailer.setTestSender(async () => { throw new Error('synthetic SMTP failure with link intentionally omitted'); });
    const failedSend = await call(tokens.adminA, '/api/v1/admin/government-employees', {
      method: 'POST', body: {
        fullName: 'Synthetic Failed Invite', employeeCode: `${fixtureId}-invite-fail`, email: failEmail,
        sectorId: 'sector-a', departmentId: 'department-a', postId: 'post-a',
        jurisdictionIds: ['jurisdiction-a'], role: 'GovernmentOfficial',
      },
    });
    assert.equal(failedSend.status, 503);
    const failureText = await failedSend.text();
    assert.doesNotMatch(failureText, /synthetic SMTP|oobCode|activationLink|resetPassword/i);
    await assert.rejects(() => auth.getUserByEmail(failEmail), error => error.code === 'auth/user-not-found',
      'failed delivery removes the pending synthetic Auth account');
    assert.equal((await db.collection('governmentEmployees').where('email', '==', failEmail).get()).size, 0,
      'failed delivery removes the pending synthetic employee record');
  } finally {
    EmployeeInvitationMailer.setTestSender(null);
    if (priorPageUrl === undefined) delete process.env.EMPLOYEE_INVITATION_PAGE_URL;
    else process.env.EMPLOYEE_INVITATION_PAGE_URL = priorPageUrl;
  }
});

test('employee operations require current Active status and verified identity', async () => {
  assert.equal((await call(tokens.staffF, '/api/v1/cases?limit=10')).status, 403,
    'unrecognized stored permission identifiers fail closed');
  const staffId = `${fixtureId}-staff-e`;
  assert.equal((await call(tokens.staffE, '/api/v1/cases?limit=10')).status, 403,
    'pending and unverified staff identity is denied even with an active token');
  const selfVerify = await call(tokens.staffE, `/api/v1/admin/government-employees/${staffId}/verify-identity`, {
    method: 'POST', body: { reason: 'Synthetic self verification attempt', evidenceReference: 'synthetic-evidence-self' },
  });
  assert.equal(selfVerify.status, 403, 'unverified employee cannot invoke privileged identity verification');
  const missingReference = await call(tokens.adminA, `/api/v1/admin/government-employees/${staffId}/verify-identity`, {
    method: 'POST', body: { reason: 'Synthetic reason without evidence reference' },
  });
  assert.equal(missingReference.status, 400, 'reason alone cannot mark identity as verified');
  const verify = await call(tokens.adminA, `/api/v1/admin/government-employees/${staffId}/verify-identity`, {
    method: 'POST', body: { reason: 'Synthetic local identity evidence checked', evidenceReference: 'synthetic-evidence-record-001' },
  });
  assert.equal(verify.status, 200, await verify.text());
  assert.equal((await db.collection('governmentEmployees').doc(staffId).get()).get('identityVerificationStatus'), 'Verified');
  const verifiedHistory = await require('../../dist/platform/firestore/FirestoreService.js').FirestoreService.listEmployeeAuditLogs(staffId);
  assert.equal(verifiedHistory.find(item => item.event === 'EMPLOYEE_IDENTITY_VERIFIED')?.evidenceReference,
    'synthetic-evidence-record-001', 'employee audit history preserves the verification evidence reference');

  const activate = await call(tokens.adminA, `/api/v1/admin/government-employees/${staffId}/status`, {
    method: 'PUT', body: { status: 'Active' },
  });
  assert.equal(activate.status, 200, 'activation is permitted after verified identity');
  assert.equal((await db.collection('governmentEmployees').doc(staffId).get()).get('accountStatus'), 'Active');
  assert.equal((await call(tokens.staffE, '/api/v1/cases?limit=10')).status, 401,
    'status activation revokes the pre-existing session token');
  tokens.staffE = await signInExisting(staffId);
  assert.equal((await call(tokens.staffE, '/api/v1/cases?limit=10')).status, 200,
    'a newly authenticated verified active employee can use in-scope read operations');
});

test('employee transfers require authorized scope, clear permissions, and revoke the old session', async () => {
  const staffId = `${fixtureId}-staff-g`;
  const grievanceA = `${fixtureId}-transfer-a-case`;
  const grievanceC = `${fixtureId}-transfer-c-case`;
  await db.collection('grievances').doc(grievanceA).set({
    ...baseRecord, publicId: grievanceA, uuid: `${fixtureId}-transfer-a`, citizenUserId: `${fixtureId}-citizen-a`,
    citizen: { uid: `${fixtureId}-citizen-a` }, departmentId: 'department-a', jurisdictionId: 'jurisdiction-a',
  });
  await db.collection('grievances').doc(grievanceC).set({
    ...baseRecord, publicId: grievanceC, uuid: `${fixtureId}-transfer-c`, citizenUserId: `${fixtureId}-citizen-a`,
    citizen: { uid: `${fixtureId}-citizen-a` }, departmentId: 'department-a', jurisdictionId: 'jurisdiction-c',
  });
  assert.equal((await call(tokens.staffG, `/api/v1/grievances/${grievanceA}`)).status, 200);

  const crossJurisdictionDenied = await call(tokens.adminA, `/api/v1/admin/government-employees/${staffId}/transfer`, {
    method: 'POST', body: { newDepartmentId: 'department-a', newPostId: 'post-a', newJurisdictionIds: ['jurisdiction-c'], reason: 'Synthetic out of scope transfer' },
  });
  assert.equal(crossJurisdictionDenied.status, 400, 'DepartmentAdmin cannot transfer into an unauthorized jurisdiction');
  const crossDepartmentDenied = await call(tokens.adminMulti, `/api/v1/admin/government-employees/${staffId}/transfer`, {
    method: 'POST', body: { newDepartmentId: 'department-b', newPostId: 'post-b', newJurisdictionIds: ['jurisdiction-b'], reason: 'Synthetic cross department attempt' },
  });
  assert.equal(crossDepartmentDenied.status, 403, 'DepartmentAdmin cannot transfer into another department');

  const transferred = await call(tokens.adminMulti, `/api/v1/admin/government-employees/${staffId}/transfer`, {
    method: 'POST', body: { newDepartmentId: 'department-a', newPostId: 'post-a', newJurisdictionIds: ['jurisdiction-c'], reason: 'Synthetic authorized jurisdiction transfer' },
  });
  assert.equal(transferred.status, 200);
  const employee = await db.collection('governmentEmployees').doc(staffId).get();
  assert.deepEqual(employee.get('jurisdictionIds'), ['jurisdiction-c']);
  assert.deepEqual(employee.get('permissions'), [], 'transfer clears prior operational grants');
  assert.equal((await call(tokens.staffG, `/api/v1/grievances/${grievanceA}`)).status, 401,
    'transfer revokes the pre-transfer ID token');

  tokens.staffG = await signInExisting(staffId);
  assert.equal((await call(tokens.staffG, `/api/v1/grievances/${grievanceA}`)).status, 404,
    'newly authenticated employee cannot read prior-jurisdiction grievances');
  assert.equal((await call(tokens.staffG, `/api/v1/grievances/${grievanceC}`)).status, 200,
    'newly authenticated employee can read within the destination jurisdiction');
});

test('unclassified submissions remain citizen-visible in restricted triage until an approved mapping routes them', async () => {
  const created = await call(tokens.citizenA, '/api/v1/grievances', {
    method: 'POST', body: {
      title: 'Synthetic routing test', description: 'Test only; no real citizen data.',
      categoryId: 'client-suggestion-untrusted', location: { district: 'Untrusted Free Text', stateCode: 'AA' },
      aiClassification: { provider: 'client-controlled', department: 'Forged department', priority: 'Critical', slaHours: 1 },
    },
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.routingStatus, 'NeedsTriage');
  assert.equal(createdBody.departmentId, undefined);
  assert.equal(createdBody.jurisdictionId, undefined);
  assert.match(createdBody.message, /verified department routing/i);
  const docRef = db.collection('grievances').doc(createdBody.publicId);
  let persisted = await docRef.get();
  assert.equal(persisted.get('priority'), 'Unclassified', 'client AI priority cannot determine the official grievance priority');
  assert.equal(persisted.get('slaHours'), undefined);
  assert.equal(persisted.get('routingStatus'), 'NeedsTriage');

  const categoryList = await call(tokens.adminA, '/api/v1/hierarchy/grievance-categories');
  assert.equal(categoryList.status, 200);
  assert.deepEqual((await categoryList.json()).items.map(item => item.categoryId), ['synthetic-category-a']);
  assert.equal((await call(tokens.staffD, '/api/v1/hierarchy/grievance-categories')).status, 403,
    'unpermissioned staff cannot enumerate the canonical category catalog');

  const normalQueue = await call(tokens.staffD, '/api/v1/cases?limit=50');
  assert.equal(normalQueue.status, 200);
  assert.equal((await normalQueue.json()).items.some(item => item.publicId === createdBody.publicId), false,
    'unrouted records are excluded from ordinary staff case queues');

  const invalidCategoryMapping = await call(tokens.adminA, '/api/v1/hierarchy/grievance-routing-mappings', {
    method: 'POST', body: {
      stateCode: 'ZZ', districtName: 'Synthetic District A', categoryId: 'client-suggestion-untrusted',
      departmentId: 'department-a', jurisdictionId: 'jurisdiction-a', priority: 'High', slaHours: 12,
      reason: 'Synthetic mapping with unknown category must fail',
    },
  });
  assert.equal(invalidCategoryMapping.status, 400, 'client or unknown categories cannot become authoritative mappings');
  const invalidGeographyMapping = await call(tokens.adminA, '/api/v1/hierarchy/grievance-routing-mappings', {
    method: 'POST', body: {
      stateCode: 'AA', districtName: 'Invented District', categoryId: 'synthetic-category-a',
      departmentId: 'department-a', jurisdictionId: 'jurisdiction-a', priority: 'High', slaHours: 12,
      reason: 'Synthetic mapping with mismatched jurisdiction must fail',
    },
  });
  assert.equal(invalidGeographyMapping.status, 400, 'geography must match the canonical jurisdiction record');

  const mappingResponse = await call(tokens.adminA, '/api/v1/hierarchy/grievance-routing-mappings', {
    method: 'POST', body: {
      stateCode: 'ZZ', districtName: 'Synthetic District A', categoryId: 'synthetic-category-a',
      departmentId: 'department-a', jurisdictionId: 'jurisdiction-a',
      priority: 'High', slaHours: 12, reason: 'Synthetic approved routing policy',
    },
  });
  assert.equal(mappingResponse.status, 201);
  const mapping = await mappingResponse.json();

  const triage = await call(tokens.adminA, '/api/v1/grievances/triage?limit=10', { clientIp: '198.51.100.41' });
  assert.equal(triage.status, 200);
  const triageBody = await triage.json();
  const triageItem = triageBody.items.find(item => item.publicId === createdBody.publicId);
  assert.ok(triageItem, 'explicitly permissioned triage can see the unresolved item');
  assert.equal(triageItem.citizenUserId, undefined);
  assert.equal(triageItem.citizenEmail, undefined);
  assert.equal(triageItem.attachments, undefined);
  const deniedTriage = await call(tokens.staffD, '/api/v1/grievances/triage', { clientIp: '198.51.100.42' });
  assert.equal(deniedTriage.status, 403, 'ordinary staff without triage permission cannot read the triage queue');
  assert.match((await deniedTriage.json()).code, /Forbidden|PermissionDenied/);

  const routed = await call(tokens.adminA, `/api/v1/grievances/${encodeURIComponent(createdBody.publicId)}/route`, {
    method: 'POST', clientIp: '198.51.100.43', body: {
      mappingId: mapping.mappingId, categoryId: 'synthetic-category-a',
    reason: 'Synthetic triage review approved canonical category and jurisdiction mapping',
    },
  });
  assert.equal(routed.status, 200);
  persisted = await docRef.get();
  assert.equal(persisted.get('routingStatus'), 'Routed');
  assert.equal(persisted.get('departmentId'), 'department-a');
  assert.equal(persisted.get('jurisdictionId'), 'jurisdiction-a');
  assert.equal(persisted.get('priority'), 'High', 'approved mapping overrides client AI priority suggestion');
  assert.equal(persisted.get('slaHours'), 12, 'approved mapping provides the authoritative SLA');
  assert.equal(persisted.get('version'), 1);
  const routeAudit = await db.collection('adminAuditLogs').where('publicId', '==', createdBody.publicId)
    .where('event', '==', 'GRIEVANCE_ROUTED_FROM_TRIAGE').get();
  assert.equal(routeAudit.size, 1, 'routing decision is durably audited');
  const citizenRead = await call(tokens.citizenA, `/api/v1/grievances/${encodeURIComponent(createdBody.publicId)}`);
  assert.equal(citizenRead.status, 200, 'citizen ownership access remains available after routing');
});
