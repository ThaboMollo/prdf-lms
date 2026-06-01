import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from './roles.helper';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private supabaseAdmin: SupabaseClient;

  constructor(private readonly db: DatabaseService) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    this.supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);

    const { data, error } = await this.supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const supabaseUser = data.user;
    const userId = supabaseUser.id;

    const roleRows = await this.db.query<{ name: string }>(
      `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
      [userId],
    );
    const roles = [...new Set(roleRows.map((r) => r.name))];

    const profileRow = await this.db.queryOne<{ full_name: string | null }>(
      `select full_name from public.profiles where user_id = $1`,
      [userId],
    );

    const currentUser: CurrentUser = {
      userId,
      email: supabaseUser.email ?? '',
      fullName: profileRow?.full_name ?? null,
      roles,
    };

    request.user = currentUser;
    return true;
  }
}
