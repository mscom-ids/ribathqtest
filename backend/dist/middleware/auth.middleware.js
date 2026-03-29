"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';
const verifyToken = (req, res, next) => {
    // Check headers for 'Authorization: Bearer <token>'
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Attach the decoded payload (user id, role, email) to the request object
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};
exports.verifyToken = verifyToken;
const requireRole = (roles) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user || (!roles.includes(user.role) && !roles.includes('all'))) {
            return res.status(403).json({ success: false, error: 'Forbidden. Insufficient permissions.' });
        }
        next();
    };
};
exports.requireRole = requireRole;
