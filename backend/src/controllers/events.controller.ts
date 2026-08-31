import { Request, Response } from 'express';
import { db } from '../config/db';
import { cachedResult, invalidateCacheByPrefix } from '../utils/server-cache';
import { notifyMentorsForEvent } from '../services/whatsapp.service';

export const getEvents = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT * FROM events 
            ORDER BY start_date ASC, start_time ASC
        `;
        const events = await cachedResult('events:list', 60_000, async () => {
            const result = await db.query(query);
            return result.rows;
        });
        res.status(200).json({ success: true, events });
    } catch (e: any) {
        console.error("Error fetching events:", e);
        res.status(500).json({ success: false, error: e.message || "Failed to fetch events" });
    }
};

export const createEvent = async (req: Request, res: Response) => {
    try {
        const { title, category, event_for, target_roles, start_date, end_date, start_time, end_time, message } = req.body;

        if (!title || !category || !event_for || !start_date || !end_date || !start_time || !end_time) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        if (start_date < todayStr) {
            return res.status(400).json({ success: false, error: "Cannot create events in past dates." });
        }

        if (end_date < start_date) {
            return res.status(400).json({ success: false, error: "End date cannot be before start date." });
        }

        if (start_date === end_date && end_time <= start_time) {
            return res.status(400).json({ success: false, error: "End time must be after start time." });
        }

        const rolesJson = event_for === 'Mentors' && target_roles ? JSON.stringify(target_roles) : null;

        const query = `
            INSERT INTO events (title, category, event_for, target_roles, start_date, end_date, start_time, end_time, message)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const params = [title, category, event_for, rolesJson, start_date, end_date, start_time, end_time, message];

        const result = await db.query(query, params);
        invalidateCacheByPrefix('events:');

        const savedEvent = result.rows[0];

        // Trigger WhatsApp Notification to Mentors in background
        notifyMentorsForEvent(savedEvent).catch(err => console.error("Error sending WhatsApp notification:", err));

        res.status(201).json({ success: true, event: savedEvent });
    } catch (e: any) {
        console.error("Error creating event:", e);
        res.status(500).json({ success: false, error: e.message || "Failed to create event" });
    }
};

export const updateEvent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, category, event_for, target_roles, start_date, end_date, start_time, end_time, message } = req.body;

        if (!title || !category || !event_for || !start_date || !end_date || !start_time || !end_time) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        if (end_date < start_date) {
            return res.status(400).json({ success: false, error: "End date cannot be before start date." });
        }

        if (start_date === end_date && end_time <= start_time) {
            return res.status(400).json({ success: false, error: "End time must be after start time." });
        }

        const rolesJson = event_for === 'Mentors' && target_roles ? JSON.stringify(target_roles) : null;

        const query = `
            UPDATE events
            SET title=$1, category=$2, event_for=$3, target_roles=$4, start_date=$5, end_date=$6, start_time=$7, end_time=$8, message=$9
            WHERE id=$10
            RETURNING *
        `;
        const params = [title, category, event_for, rolesJson, start_date, end_date, start_time, end_time, message, id];

        const result = await db.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Event not found" });
        invalidateCacheByPrefix('events:');

        const updatedEvent = result.rows[0];
        notifyMentorsForEvent(updatedEvent).catch(err => console.error("Error sending WhatsApp notification:", err));

        res.status(200).json({ success: true, event: updatedEvent });
    } catch (e: any) {
        console.error("Error updating event:", e);
        res.status(500).json({ success: false, error: e.message || "Failed to update event" });
    }
};

export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await db.query(`DELETE FROM events WHERE id = $1 RETURNING *`, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Event not found" });
        }

        invalidateCacheByPrefix('events:');
        res.status(200).json({ success: true, message: "Event deleted successfully" });
    } catch (e: any) {
        console.error("Error deleting event:", e);
        res.status(500).json({ success: false, error: e.message || "Failed to delete event" });
    }
};
