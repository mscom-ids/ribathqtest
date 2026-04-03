import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';

// Use memory storage — file goes into RAM buffer, then we push to Supabase
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Images Only!'));
        }
    }
}).single('avatar');

export const uploadAvatar = (req: Request, res: Response) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        try {
            const ext = path.extname(req.file.originalname).toLowerCase();
            const fileName = `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

            // Upload buffer directly to Supabase Storage bucket "avatars"
            const { error: uploadError } = await supabaseAdmin.storage
                .from('avatars')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('[Upload] Supabase storage error:', uploadError.message);
                return res.status(500).json({ success: false, error: 'Failed to upload image to storage.' });
            }

            // Get the permanent public URL
            const { data } = supabaseAdmin.storage
                .from('avatars')
                .getPublicUrl(fileName);

            return res.json({
                success: true,
                filePath: data.publicUrl
            });

        } catch (e: any) {
            console.error('[Upload] Unexpected error:', e.message);
            return res.status(500).json({ success: false, error: 'Internal server error during upload.' });
        }
    });
};
