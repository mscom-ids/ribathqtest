import express from 'express';
import { verifyDelegation, verifyToken, requireRole } from '../../middleware/auth.middleware';
import { DISCIPLINE_REPORT_ROLES, DISCIPLINE_REVIEW_ROLES, DISCIPLINE_SETTINGS_ROLES, DISCIPLINE_VIEW_ROLES } from './discipline.types';
import { addCorrectiveAction, addPositiveBehaviour, addStudentResponse, closeIncident, createIncident, getIncident, getStudentDisciplineProfile, listIncidents, reviewIncident, updateCorrectiveAction } from './discipline.controller';
import { createCategory, createOffence, getDisciplineDashboard, getDisciplineReports, getDisciplineSettings, updateCategory, updateDisciplineSettings, updateOffence } from './discipline.analytics.controller';
import { recordParentCommunication, submitIncident, updateDraftIncident } from './discipline.workflow.controller';

const router = express.Router();
router.use(verifyToken);
router.use(verifyDelegation);

router.get('/dashboard', requireRole(DISCIPLINE_VIEW_ROLES), getDisciplineDashboard);
router.get('/incidents', requireRole(DISCIPLINE_VIEW_ROLES), listIncidents);
router.post('/incidents', requireRole(DISCIPLINE_REPORT_ROLES), createIncident);
router.get('/incidents/:id', requireRole(DISCIPLINE_VIEW_ROLES), getIncident);
router.patch('/incidents/:id', requireRole(DISCIPLINE_REPORT_ROLES), updateDraftIncident);
router.post('/incidents/:id/submit', requireRole(DISCIPLINE_REPORT_ROLES), submitIncident);
router.post('/incidents/:id/parent-communications', requireRole(DISCIPLINE_REVIEW_ROLES), recordParentCommunication);
router.post('/incidents/:id/review', requireRole(DISCIPLINE_REVIEW_ROLES), reviewIncident);
router.post('/incidents/:id/student-response', requireRole(DISCIPLINE_REVIEW_ROLES), addStudentResponse);
router.post('/incidents/:id/actions', requireRole(DISCIPLINE_REVIEW_ROLES), addCorrectiveAction);
router.post('/incidents/:id/close', requireRole(DISCIPLINE_REVIEW_ROLES), closeIncident);
router.patch('/actions/:actionId', requireRole(DISCIPLINE_REVIEW_ROLES), updateCorrectiveAction);
router.get('/students/:studentId/profile', requireRole(DISCIPLINE_VIEW_ROLES), getStudentDisciplineProfile);
router.post('/students/:studentId/positive-behaviour', requireRole(DISCIPLINE_REVIEW_ROLES), addPositiveBehaviour);
router.get('/reports', requireRole(DISCIPLINE_REVIEW_ROLES), getDisciplineReports);
router.get('/settings', requireRole(DISCIPLINE_VIEW_ROLES), getDisciplineSettings);
router.patch('/settings', requireRole(DISCIPLINE_SETTINGS_ROLES), updateDisciplineSettings);
router.post('/categories', requireRole(DISCIPLINE_SETTINGS_ROLES), createCategory);
router.patch('/categories/:id', requireRole(DISCIPLINE_SETTINGS_ROLES), updateCategory);
router.post('/offences', requireRole(DISCIPLINE_SETTINGS_ROLES), createOffence);
router.patch('/offences/:id', requireRole(DISCIPLINE_SETTINGS_ROLES), updateOffence);

export default router;