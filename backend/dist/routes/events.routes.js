"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const events_controller_1 = require("../controllers/events.controller");
const router = express_1.default.Router();
router.get('/', events_controller_1.getEvents);
router.post('/', events_controller_1.createEvent);
router.put('/:id', events_controller_1.updateEvent);
router.delete('/:id', events_controller_1.deleteEvent);
exports.default = router;
