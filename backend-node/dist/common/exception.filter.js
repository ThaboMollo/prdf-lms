"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    logger = new common_1.Logger(AllExceptionsFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            message = typeof res === 'string' ? res : res.message ?? message;
        }
        else if (exception instanceof Error) {
            const msg = exception.message.toLowerCase();
            if (msg.includes('unauthorized') || msg.includes('cannot access') || msg.includes('only admin') || msg.includes('only staff') || msg.includes('only internal') || msg.includes('only loanofficer')) {
                status = common_1.HttpStatus.FORBIDDEN;
                message = exception.message;
            }
            else if (msg.includes('not found') || msg.includes('does not exist')) {
                status = common_1.HttpStatus.NOT_FOUND;
                message = exception.message;
            }
            else if (msg.includes('invalid') || msg.includes('required') || msg.includes('cannot') || msg.includes('already') || msg.includes('transition')) {
                status = common_1.HttpStatus.BAD_REQUEST;
                message = exception.message;
            }
            else {
                this.logger.error(exception.message, exception.stack);
            }
        }
        response.status(status).json({ statusCode: status, message, path: request.url });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=exception.filter.js.map