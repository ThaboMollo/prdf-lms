export declare const STAFF_ROLES: readonly ["Admin", "LoanOfficer"];
export declare const ASSIGNED_ROLES: readonly ["Intern", "Originator"];
export declare const INTERNAL_ROLES: readonly ["Admin", "LoanOfficer", "Intern", "Originator"];
export interface CurrentUser {
    userId: string;
    email: string;
    fullName: string | null;
    roles: string[];
}
export declare function hasRole(roles: string[], role: string): boolean;
export declare function hasAnyRole(roles: string[], ...expected: string[]): boolean;
export declare function isStaff(roles: string[]): boolean;
export declare function isAssigned(roles: string[]): boolean;
export declare function isInternal(roles: string[]): boolean;
export declare function isClient(roles: string[]): boolean;
export declare function ensureStaff(roles: string[]): void;
export declare function ensureInternal(roles: string[]): void;
export declare function ensureAdmin(roles: string[]): void;
