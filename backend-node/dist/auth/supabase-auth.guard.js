"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SupabaseAuthGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const supabase_js_1 = require("@supabase/supabase-js");
const database_service_1 = require("../database/database.service");
let SupabaseAuthGuard = SupabaseAuthGuard_1 = class SupabaseAuthGuard {
    db;
    logger = new common_1.Logger(SupabaseAuthGuard_1.name);
    supabaseAdmin;
    constructor(db) {
        this.db = db;
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey)
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
        this.supabaseAdmin = (0, supabase_js_1.createClient)(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];
        if (!authHeader?.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Missing Bearer token');
        }
        const token = authHeader.slice(7);
        const { data, error } = await this.supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            throw new common_1.UnauthorizedException('Invalid or expired token');
        }
        const supabaseUser = data.user;
        const userId = supabaseUser.id;
        const roleRows = await this.db.query(`select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`, [userId]);
        const roles = [...new Set(roleRows.map((r) => r.name))];
        const profileRow = await this.db.queryOne(`select full_name from public.profiles where user_id = $1`, [userId]);
        const currentUser = {
            userId,
            email: supabaseUser.email ?? '',
            fullName: profileRow?.full_name ?? null,
            roles,
        };
        request.user = currentUser;
        return true;
    }
};
exports.SupabaseAuthGuard = SupabaseAuthGuard;
exports.SupabaseAuthGuard = SupabaseAuthGuard = SupabaseAuthGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], SupabaseAuthGuard);
//# sourceMappingURL=supabase-auth.guard.js.map