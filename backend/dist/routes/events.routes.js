"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const events_controller_1 = require("../controllers/events.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
const VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.get('/', (0, auth_middleware_1.requireRole)(VIEW_ROLES), events_controller_1.getEvents);
router.post('/', (0, auth_middleware_1.requireRole)(MANAGE_ROLES), events_controller_1.createEvent);
router.put('/:id', (0, auth_middleware_1.requireRole)(MANAGE_ROLES), events_controller_1.updateEvent);
router.delete('/:id', (0, auth_middleware_1.requireRole)(MANAGE_ROLES), events_controller_1.deleteEvent);
exports.default = router;
