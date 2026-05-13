import { Request, Response } from 'express';
import {
    canManageMentorAccess,
    getMentorAccessDecision,
    listMentorAccessPolicies,
    saveMentorAccessPolicy,
    MentorAccessFeature,
} from '../utils/mentor-access-policy';
import { invalidateCacheByPrefix } from '../utils/server-cache';

export const getMentorAccessPolicies = async (req: Request, res: Response) => {
    try {
        const policies = await listMentorAccessPolicies();
        res.json({ success: true, policies });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateMentorAccessPolicy = async (req: Request, res: Response) => {
    try {
        const role = (req as any).user?.role;
        if (!canManageMentorAccess(role)) {
            return res.status(403).json({ success: false, error: 'Only admins can manage mentor access locks.' });
        }

        const { feature, default_window_days, unlock_start_date, unlock_end_date, note } = req.body;
        const policy = await saveMentorAccessPolicy({
            feature,
            default_window_days,
            unlock_start_date,
            unlock_end_date,
            note,
            updated_by: (req as any).user?.id || null,
        });

        invalidateCacheByPrefix('attendance:');
        invalidateCacheByPrefix('hifz:');
        res.json({ success: true, policy });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
};

export const getMentorAccessDecisionForDate = async (req: Request, res: Response) => {
    try {
        const { feature, date } = req.query;
        if (!feature || !date) {
            return res.status(400).json({ success: false, error: 'feature and date are required' });
        }

        const decision = await getMentorAccessDecision(feature as MentorAccessFeature, String(date));
        res.json({ success: true, decision });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
