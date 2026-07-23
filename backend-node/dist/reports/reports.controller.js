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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const supabase_auth_guard_1 = require("../auth/supabase-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const reports_service_1 = require("./reports.service");
let ReportsController = class ReportsController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    portfolio(u) { return this.svc.portfolio(u); }
    arrears(u) { return this.svc.arrears(u); }
    audit(u, from, to, limit) { return this.svc.audit(u, from, to, limit ? parseInt(limit) : 200); }
    turnaround(u) { return this.svc.turnaround(u); }
    pipelineConversion(u) { return this.svc.pipelineConversion(u); }
    productivity(u) { return this.svc.productivity(u); }
    pipelineSummary(u, startDate, endDate) { return this.svc.pipelineSummary(u, startDate, endDate); }
    originationTrends(u, startDate, endDate) { return this.svc.originationTrends(u, startDate, endDate); }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('portfolio'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "portfolio", null);
__decorate([
    (0, common_1.Get)('arrears'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "arrears", null);
__decorate([
    (0, common_1.Get)('audit'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "audit", null);
__decorate([
    (0, common_1.Get)('turnaround'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "turnaround", null);
__decorate([
    (0, common_1.Get)('pipeline-conversion'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "pipelineConversion", null);
__decorate([
    (0, common_1.Get)('productivity'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "productivity", null);
__decorate([
    (0, common_1.Get)('pipeline-summary'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "pipelineSummary", null);
__decorate([
    (0, common_1.Get)('origination-trends'),
    __param(0, (0, current_user_decorator_1.GetCurrentUser)()),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "originationTrends", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('api/reports'),
    (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map