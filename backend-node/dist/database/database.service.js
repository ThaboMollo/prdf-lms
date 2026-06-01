"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DatabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
let DatabaseService = DatabaseService_1 = class DatabaseService {
    logger = new common_1.Logger(DatabaseService_1.name);
    pool;
    onModuleInit() {
        const connStr = process.env.SUPABASE_DB_CONNECTION_STRING;
        if (!connStr)
            throw new Error('SUPABASE_DB_CONNECTION_STRING is required');
        this.pool = new pg_1.Pool({
            connectionString: connStr,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
        });
        this.pool.on('error', (err) => this.logger.error('Unexpected pool error', err));
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
    async query(sql, params) {
        const result = await this.pool.query(sql, params);
        return result.rows;
    }
    async queryOne(sql, params) {
        const rows = await this.query(sql, params);
        return rows[0] ?? null;
    }
    async execute(sql, params) {
        const result = await this.pool.query(sql, params);
        return result.rowCount ?? 0;
    }
    async withTransaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)()
], DatabaseService);
//# sourceMappingURL=database.service.js.map