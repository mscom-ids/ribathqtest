import { Request, Response } from 'express';
import { db } from '../../config/db';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../../utils/server-cache';
import { audit, calculateRisk, reporterScopeSql, resolveDisciplineActor } from './discipline.service';
import { cleanText, requiredText } from './discipline.validation';

function errorResponse(res: Response, error: any, fallback: string) {
    console.error(`[discipline] ${fallback}:`, error);
    return res.status(500).json({ success: false, error: error?.message || fallback });
}

export async function getDisciplineDashboard(req: Request, res: Response) {
    try {
        const actor = await resolveDisciplineActor(req);
        const cacheKey = makeCacheKey('discipline:dashboard', { role: actor.role, staff: actor.staffId || '' });
        const payload = await cachedResult(cacheKey, 60_000, async () => {
            const params: any[] = [];
            const scope = reporterScopeSql(actor.role, actor.staffId, params);
            const [summary, recent, categories, trend, risk] = await Promise.all([
                db.query(
                    `WITH visible AS (SELECT * FROM discipline_incidents i WHERE i.deleted_at IS NULL ${scope}),
                    active_marks AS (SELECT student_id,COALESCE(sum(marks),0)::int marks FROM discipline_marks
                      WHERE status='active' AND (expires_at IS NULL OR expires_at>=CURRENT_DATE) GROUP BY student_id),
                    positive AS (SELECT student_id,COALESCE(sum(marks),0)::int marks FROM discipline_positive_marks GROUP BY student_id)
                    SELECT count(*) FILTER (WHERE reported_at::date=CURRENT_DATE)::int incidents_today,
                           count(*) FILTER (WHERE status IN ('submitted','under_review','waiting_student_explanation'))::int waiting_review,
                           count(*) FILTER (WHERE severity IN ('major','critical') AND status<>'completed')::int serious_cases,
                           (SELECT count(*)::int FROM active_marks m LEFT JOIN positive p USING(student_id) WHERE greatest(m.marks-COALESCE(p.marks,0),0)>7) students_needing_attention,
                           (SELECT count(*)::int FROM discipline_actions WHERE status IN ('not_started','in_progress')) pending_actions,
                           (SELECT count(*)::int FROM discipline_actions WHERE status IN ('not_started','in_progress') AND due_date<CURRENT_DATE) overdue_actions,
                           count(*) FILTER (WHERE status='completed' AND closed_at>=CURRENT_DATE-interval '30 days')::int completed_last_30
                    FROM visible`, params),
                db.query(
                    `SELECT i.id,i.reference_no,i.student_id,s.name student_name,i.status,i.severity,i.reported_at,
                            c.name category_name,o.name offence_name,r.name reporter_name
                     FROM discipline_incidents i JOIN students s ON s.adm_no=i.student_id
                     JOIN discipline_categories c ON c.id=i.category_id JOIN discipline_offence_types o ON o.id=i.offence_type_id
                     LEFT JOIN staff r ON r.id=i.reported_by WHERE i.deleted_at IS NULL ${scope}
                     ORDER BY i.reported_at DESC LIMIT 8`, params),
                db.query(
                    `SELECT c.name,count(*)::int count FROM discipline_incidents i JOIN discipline_categories c ON c.id=i.category_id
                     WHERE i.deleted_at IS NULL AND i.reported_at>=CURRENT_DATE-interval '90 days' ${scope}
                     GROUP BY c.id,c.name ORDER BY count DESC LIMIT 6`, params),
                db.query(
                    `SELECT to_char(months.month_start,'Mon') label,
                            to_char(months.month_start,'YYYY-MM') AS month,
                            COALESCE(count(i.id),0)::int count
                     FROM generate_series(
                         date_trunc('month',CURRENT_DATE)-interval '5 months',
                         date_trunc('month',CURRENT_DATE),
                         interval '1 month'
                     ) AS months(month_start)
                     LEFT JOIN discipline_incidents i
                       ON date_trunc('month',i.reported_at)=months.month_start
                      AND i.deleted_at IS NULL ${scope}
                     GROUP BY months.month_start
                     ORDER BY months.month_start`, params),
                db.query(
                    `WITH negative AS (SELECT student_id,sum(marks)::int marks FROM discipline_marks
                      WHERE status='active' AND (expires_at IS NULL OR expires_at>=CURRENT_DATE) GROUP BY student_id),
                    positive AS (SELECT student_id,sum(marks)::int marks FROM discipline_positive_marks GROUP BY student_id)
                    SELECT s.adm_no student_id,s.name,s.photo_url,p.standard,p.division,
                           greatest(n.marks-COALESCE(pm.marks,0),0)::int active_marks
                    FROM negative n JOIN students s ON s.adm_no=n.student_id
                    LEFT JOIN positive pm ON pm.student_id=n.student_id
                    LEFT JOIN academic_years ay ON ay.is_current=true
                    LEFT JOIN academic_student_placements p ON p.student_id=s.adm_no AND p.academic_year_id=ay.id AND p.status='active'
                    ORDER BY active_marks DESC LIMIT 8`),
            ]);
            const riskRows = await Promise.all(risk.rows.map(async row => ({ ...row, risk_level: await calculateRisk(Number(row.active_marks)) })));
            return { summary: summary.rows[0], recent: recent.rows, categories: categories.rows, trend: trend.rows, risk: riskRows };
        });
        return res.json({ success: true, ...payload });
    } catch (error) { return errorResponse(res, error, 'Failed to load discipline dashboard'); }
}

export async function getDisciplineReports(req: Request, res: Response) {
    try {
        const from = String(req.query.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
        const to = String(req.query.to || new Date().toISOString().slice(0, 10));
        const filters: string[] = ['i.deleted_at IS NULL', 'i.reported_at >= $1::date', "i.reported_at < ($2::date + 1)"];
        const params: any[] = [from, to];
        const add = (fragment: string, value: any) => { params.push(value); filters.push(fragment.replace('?', `$${params.length}`)); };
        if (req.query.category_id) add('i.category_id=?', req.query.category_id);
        if (req.query.severity) add('i.severity=?', req.query.severity);
        if (req.query.status) add('i.status=?', req.query.status);
        if (req.query.class_name) add('i.class_name=?', req.query.class_name);
        if (req.query.hostel) add('i.hostel=?', req.query.hostel);
        const where = filters.join(' AND ');
        const key = makeCacheKey('discipline:reports', { ...req.query, from, to });
        const report = await cachedResult(key, 60_000, async () => {
            const [summary, byCategory, bySeverity, byMonth, byClass, repeat, records] = await Promise.all([
                db.query(`SELECT count(*)::int total,count(DISTINCT student_id)::int students,
                          count(*) FILTER(WHERE repeat_offence)::int repeat_offences,
                          count(*) FILTER(WHERE status='completed')::int resolved,
                          count(*) FILTER(WHERE status NOT IN ('completed','cancelled'))::int open
                          FROM discipline_incidents i WHERE ${where}`, params),
                db.query(`SELECT c.name,count(*)::int count FROM discipline_incidents i JOIN discipline_categories c ON c.id=i.category_id WHERE ${where} GROUP BY c.id,c.name ORDER BY count DESC`, params),
                db.query(`SELECT severity,count(*)::int count FROM discipline_incidents i WHERE ${where} GROUP BY severity ORDER BY count DESC`, params),
                db.query(`SELECT to_char(date_trunc('month',reported_at),'YYYY-MM') AS month,count(*)::int count FROM discipline_incidents i WHERE ${where} GROUP BY 1 ORDER BY 1`, params),
                db.query(`SELECT COALESCE(class_name,'Not placed') class_name,count(*)::int count FROM discipline_incidents i WHERE ${where} GROUP BY 1 ORDER BY count DESC`, params),
                db.query(`SELECT s.adm_no student_id,s.name,count(*)::int incident_count,sum(i.discipline_marks)::int marks FROM discipline_incidents i JOIN students s ON s.adm_no=i.student_id WHERE ${where} GROUP BY s.adm_no,s.name HAVING count(*)>1 ORDER BY incident_count DESC,marks DESC LIMIT 20`, params),
                db.query(`SELECT i.reference_no,i.reported_at,s.adm_no,s.name,c.name category,o.name offence,i.severity,i.status,i.discipline_marks,i.class_name,i.division FROM discipline_incidents i JOIN students s ON s.adm_no=i.student_id JOIN discipline_categories c ON c.id=i.category_id JOIN discipline_offence_types o ON o.id=i.offence_type_id WHERE ${where} ORDER BY i.reported_at DESC LIMIT 500`, params),
            ]);
            return { summary: summary.rows[0], byCategory: byCategory.rows, bySeverity: bySeverity.rows, byMonth: byMonth.rows, byClass: byClass.rows, repeatStudents: repeat.rows, records: records.rows };
        });
        return res.json({ success: true, range: { from, to }, ...report });
    } catch (error) { return errorResponse(res, error, 'Failed to load discipline reports'); }
}

export async function getDisciplineSettings(_req: Request, res: Response) {
    try {
        const payload = await cachedResult('discipline:settings', 5 * 60_000, async () => {
            const [settings, categories, staff] = await Promise.all([
                db.query('SELECT key,value,updated_at FROM discipline_settings ORDER BY key'),
                db.query(`SELECT c.*,COALESCE(json_agg(o ORDER BY o.name) FILTER(WHERE o.id IS NOT NULL),'[]') offences
                          FROM discipline_categories c LEFT JOIN discipline_offence_types o ON o.category_id=c.id
                          GROUP BY c.id ORDER BY c.sort_order,c.name`),
                db.query("SELECT id,name,role FROM staff WHERE status='active' ORDER BY name"),
            ]);
            return { settings: Object.fromEntries(settings.rows.map(row => [row.key, row.value])), categories: categories.rows, staff: staff.rows };
        });
        return res.json({ success: true, ...payload });
    } catch (error) { return errorResponse(res, error, 'Failed to load discipline settings'); }
}

export async function updateDisciplineSettings(req: Request, res: Response) {
    const client = await db.getClient();
    try {
        const actor = await resolveDisciplineActor(req);
        const entries = Object.entries(req.body?.settings || {});
        if (!entries.length) return res.status(400).json({ success: false, error: 'Settings are required' });
        await client.query('BEGIN');
        for (const [key, value] of entries) {
            if (!/^[a-z0-9_]{2,80}$/.test(key)) throw new Error('Invalid setting key');
            await client.query(`INSERT INTO discipline_settings(key,value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,now())
                                ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`, [key, JSON.stringify(value), actor.staffId]);
        }
        await audit(client, { actorId: actor.staffId, action: 'discipline_settings_updated', newValue: req.body.settings, ipAddress: actor.ipAddress });
        await client.query('COMMIT'); invalidateCacheByPrefix('discipline:');
        return res.json({ success: true });
    } catch (error: any) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: error?.message || 'Failed to update settings' }); }
    finally { client.release(); }
}

export async function createCategory(req: Request, res: Response) {
    try {
        const result = await db.query(`INSERT INTO discipline_categories(name,description,color,sort_order) VALUES($1,$2,$3,$4) RETURNING *`,
            [requiredText(req.body?.name,'Category name',120),cleanText(req.body?.description,500),cleanText(req.body?.color,30)||'slate',Number(req.body?.sort_order)||0]);
        invalidateCacheByPrefix('discipline:'); return res.status(201).json({ success: true, category: result.rows[0] });
    } catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Failed to create category' }); }
}

export async function updateCategory(req: Request, res: Response) {
    try {
        const result = await db.query(`UPDATE discipline_categories SET name=$2,description=$3,color=$4,sort_order=$5,is_active=$6,updated_at=now() WHERE id=$1 RETURNING *`,
            [req.params.id,requiredText(req.body?.name,'Category name',120),cleanText(req.body?.description,500),cleanText(req.body?.color,30)||'slate',Number(req.body?.sort_order)||0,req.body?.is_active!==false]);
        if(!result.rows[0]) return res.status(404).json({success:false,error:'Category not found'}); invalidateCacheByPrefix('discipline:'); return res.json({success:true,category:result.rows[0]});
    } catch(error:any){return res.status(400).json({success:false,error:error?.message||'Failed to update category'});}
}

export async function createOffence(req: Request, res: Response) {
    try {
        const result=await db.query(`INSERT INTO discipline_offence_types(category_id,name,default_severity,default_marks,is_quick_report,parent_notification_default) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.body?.category_id,requiredText(req.body?.name,'Problem name',160),req.body?.default_severity||'minor',Number(req.body?.default_marks)||0,Boolean(req.body?.is_quick_report),Boolean(req.body?.parent_notification_default)]);
        invalidateCacheByPrefix('discipline:');return res.status(201).json({success:true,offence:result.rows[0]});
    }catch(error:any){return res.status(400).json({success:false,error:error?.message||'Failed to create problem type'});}
}

export async function updateOffence(req: Request, res: Response) {
    try {
        const result=await db.query(`UPDATE discipline_offence_types SET name=$2,default_severity=$3,default_marks=$4,is_quick_report=$5,parent_notification_default=$6,is_active=$7,updated_at=now() WHERE id=$1 RETURNING *`,
            [req.params.id,requiredText(req.body?.name,'Problem name',160),req.body?.default_severity||'minor',Number(req.body?.default_marks)||0,Boolean(req.body?.is_quick_report),Boolean(req.body?.parent_notification_default),req.body?.is_active!==false]);
        if(!result.rows[0])return res.status(404).json({success:false,error:'Problem type not found'});invalidateCacheByPrefix('discipline:');return res.json({success:true,offence:result.rows[0]});
    }catch(error:any){return res.status(400).json({success:false,error:error?.message||'Failed to update problem type'});}
}