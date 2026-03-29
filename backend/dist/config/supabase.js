"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load the root .env.local file which contains the standard Supabase credentials
// For production, this will be set via Render/DigitalOcean env variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
// Load backend-specific env if needed
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.");
    // We don't want to crash immediately on startup if they add it later, but Warn loudly.
}
// Create the Supabase Admin client using the Service Role Key
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl || 'https://dummy.supabase.co', supabaseServiceRoleKey || 'dummy_key', {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
