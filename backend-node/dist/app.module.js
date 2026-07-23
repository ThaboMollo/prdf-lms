"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const database_module_1 = require("./database/database.module");
const auth_module_1 = require("./auth/auth.module");
const health_controller_1 = require("./health/health.controller");
const me_controller_1 = require("./me/me.controller");
const admin_module_1 = require("./admin/admin.module");
const clients_module_1 = require("./clients/clients.module");
const applications_module_1 = require("./applications/applications.module");
const loans_module_1 = require("./loans/loans.module");
const tasks_module_1 = require("./tasks/tasks.module");
const documents_module_1 = require("./documents/documents.module");
const notifications_module_1 = require("./notifications/notifications.module");
const reports_module_1 = require("./reports/reports.module");
const nfs_module_1 = require("./nfs/nfs.module");
const notification_sweep_job_1 = require("./jobs/notification-sweep.job");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            admin_module_1.AdminModule,
            clients_module_1.ClientsModule,
            applications_module_1.ApplicationsModule,
            loans_module_1.LoansModule,
            tasks_module_1.TasksModule,
            documents_module_1.DocumentsModule,
            notifications_module_1.NotificationsModule,
            reports_module_1.ReportsModule,
            nfs_module_1.NfsModule,
        ],
        controllers: [health_controller_1.HealthController, me_controller_1.MeController],
        providers: [notification_sweep_job_1.NotificationSweepJob],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map