import { CurrentUser } from '../auth/roles.helper';
export declare class MeController {
    me(user: CurrentUser): {
        userId: string;
        email: string;
        fullName: string | null;
        roles: string[];
    };
}
