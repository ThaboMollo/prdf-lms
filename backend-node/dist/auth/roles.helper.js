"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERNAL_ROLES = exports.ASSIGNED_ROLES = exports.STAFF_ROLES = void 0;
exports.hasRole = hasRole;
exports.hasAnyRole = hasAnyRole;
exports.isStaff = isStaff;
exports.isAssigned = isAssigned;
exports.isInternal = isInternal;
exports.isClient = isClient;
exports.ensureStaff = ensureStaff;
exports.ensureInternal = ensureInternal;
exports.ensureAdmin = ensureAdmin;
exports.STAFF_ROLES = ['Admin', 'LoanOfficer'];
exports.ASSIGNED_ROLES = ['Intern', 'Originator'];
exports.INTERNAL_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator'];
function hasRole(roles, role) {
    return roles.some((r) => r.toLowerCase() === role.toLowerCase());
}
function hasAnyRole(roles, ...expected) {
    return expected.some((role) => hasRole(roles, role));
}
function isStaff(roles) {
    return hasAnyRole(roles, ...exports.STAFF_ROLES);
}
function isAssigned(roles) {
    return hasAnyRole(roles, ...exports.ASSIGNED_ROLES);
}
function isInternal(roles) {
    return hasAnyRole(roles, ...exports.INTERNAL_ROLES);
}
function isClient(roles) {
    return hasRole(roles, 'Client');
}
function ensureStaff(roles) {
    if (!isStaff(roles))
        throw new Error('Only Admin or LoanOfficer can perform this action.');
}
function ensureInternal(roles) {
    if (!isInternal(roles))
        throw new Error('Only internal users can perform this action.');
}
function ensureAdmin(roles) {
    if (!hasRole(roles, 'Admin'))
        throw new Error('Only Admin users can manage admin access.');
}
//# sourceMappingURL=roles.helper.js.map