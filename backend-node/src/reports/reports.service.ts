import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureStaff, fetchUserRoles, hasRole, isStaff } from '../auth/roles.helper';

const DEBTORS_AGE_BUCKETS = ['Current (not overdue)', '1-30 days', '31-60 days', '61-90 days', '91-120 days', '120+ days'];

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  private async ensureStaffActor(actor: CurrentUser) {
    ensureStaff(await fetchUserRoles(this.db, actor.userId));
  }

  /**
   * portfolio()/arrears() are consumed by both admin-ui (staff: global
   * aggregate) and client-ui (Client role: their own loans only, same
   * scope the RLS-direct Supabase path already gave them) — unlike every
   * other report method here, which is staff-only with no client-ui caller.
   */
  async portfolio(actor: CurrentUser) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (isStaff(roles)) {
      return this.db.queryOne(
        `select cast(count(*) as int) as "totalLoans", cast(count(*) filter (where status in ('Disbursed','InRepayment')) as int) as "activeLoans", coalesce(sum(principal_amount),0) as "totalPrincipal", coalesce(sum(outstanding_principal),0) as "outstandingPrincipal", coalesce(sum(principal_amount) - sum(outstanding_principal),0) as "repaidPrincipal" from public.loans`,
      );
    }
    if (!hasRole(roles, 'Client')) throw new ForbiddenException('Only staff or the applicant can view portfolio data.');
    return this.db.queryOne(
      `select cast(count(*) as int) as "totalLoans", cast(count(*) filter (where l.status in ('Disbursed','InRepayment')) as int) as "activeLoans", coalesce(sum(l.principal_amount),0) as "totalPrincipal", coalesce(sum(l.outstanding_principal),0) as "outstandingPrincipal", coalesce(sum(l.principal_amount) - sum(l.outstanding_principal),0) as "repaidPrincipal"
       from public.loans l join public.loan_applications la on la.id = l.application_id join public.clients c on c.id = la.client_id
       where c.user_id = $1`,
      [actor.userId],
    );
  }

  async arrears(actor: CurrentUser) {
    const roles = await fetchUserRoles(this.db, actor.userId);
    if (isStaff(roles)) {
      return this.db.query(
        `select rs.loan_id as "loanId", l.application_id as "applicationId", rs.installment_no as "installmentNo", rs.due_date as "dueDate", rs.due_total as "dueTotal", rs.paid_amount as "paidAmount", cast(greatest(rs.due_total-rs.paid_amount,0) as numeric(18,2)) as "outstandingAmount", cast(greatest((current_date-rs.due_date),0) as int) as "daysOverdue" from public.repayment_schedule rs join public.loans l on l.id=rs.loan_id where rs.due_date<current_date and rs.due_total>rs.paid_amount and l.status<>'Closed' order by rs.due_date asc`,
      );
    }
    if (!hasRole(roles, 'Client')) throw new ForbiddenException('Only staff or the applicant can view arrears data.');
    return this.db.query(
      `select rs.loan_id as "loanId", l.application_id as "applicationId", rs.installment_no as "installmentNo", rs.due_date as "dueDate", rs.due_total as "dueTotal", rs.paid_amount as "paidAmount", cast(greatest(rs.due_total-rs.paid_amount,0) as numeric(18,2)) as "outstandingAmount", cast(greatest((current_date-rs.due_date),0) as int) as "daysOverdue"
       from public.repayment_schedule rs
       join public.loans l on l.id = rs.loan_id
       join public.loan_applications la on la.id = l.application_id
       join public.clients c on c.id = la.client_id
       where rs.due_date < current_date and rs.due_total > rs.paid_amount and l.status <> 'Closed' and c.user_id = $1
       order by rs.due_date asc`,
      [actor.userId],
    );
  }

  async audit(actor: CurrentUser, from?: string, to?: string, limit = 200) {
    await this.ensureStaffActor(actor);
    return this.db.query(
      `select id, entity, entity_id as "entityId", action, actor_user_id as "actorUserId", at, metadata::text as metadata from public.audit_log where ($1::timestamptz is null or at>=$1::timestamptz) and ($2::timestamptz is null or at<=$2::timestamptz) order by at desc limit $3`,
      [from ?? null, to ?? null, limit],
    );
  }

  async turnaround(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    return this.db.queryOne(
      `with submitted as (select application_id, min(changed_at) as submitted_at from public.application_status_history where to_status='Submitted' group by application_id), approved as (select application_id, min(changed_at) as approved_at from public.application_status_history where to_status='Approved' group by application_id) select cast(count(*) as int) as count, cast(coalesce(avg(extract(epoch from (a.approved_at-s.submitted_at))/86400.0),0) as double precision) as "averageDays" from submitted s join approved a on a.application_id=s.application_id where a.approved_at>=s.submitted_at`,
    );
  }

  async pipelineConversion(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    return this.db.query(
      `select from_status as "fromStatus", to_status as "toStatus", cast(count(*) as int) as count from public.application_status_history group by from_status, to_status order by count(*) desc`,
    );
  }

  async productivity(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    return this.db.query(
      `with task_stats as (select coalesce(assigned_to, changed_by) as user_id, cast(count(*) filter (where status='Completed') as int) as tasks_completed from public.tasks t left join public.application_status_history h on h.application_id=t.application_id group by coalesce(assigned_to, changed_by)), app_stats as (select assigned_to_user_id as user_id, cast(count(*) as int) as applications_handled from public.loan_applications where assigned_to_user_id is not null group by assigned_to_user_id) select coalesce(t.user_id, a.user_id) as "userId", coalesce(t.tasks_completed,0) as "tasksCompleted", coalesce(a.applications_handled,0) as "applicationsHandled" from task_stats t full join app_stats a on a.user_id=t.user_id where coalesce(t.user_id,a.user_id) is not null order by coalesce(t.tasks_completed,0) desc`,
    );
  }

  async pipelineSummary(actor: CurrentUser, startDate?: string, endDate?: string) {
    await this.ensureStaffActor(actor);
    return this.db.query(
      `select status, cast(count(*) as int) as count, cast(coalesce(sum(requested_amount), 0) as double precision) as "totalAmount"
       from public.loan_applications
       where ($1::timestamptz is null or created_at >= $1::timestamptz)
         and ($2::timestamptz is null or created_at <= $2::timestamptz)
       group by status
       order by count(*) desc`,
      [startDate ?? null, endDate ?? null],
    );
  }

  async originationTrends(actor: CurrentUser, startDate?: string, endDate?: string) {
    await this.ensureStaffActor(actor);
    return this.db.query(
      `select to_char(disbursed_at, 'YYYY-MM') as month,
              cast(count(*) as int) as count,
              cast(coalesce(sum(principal_amount), 0) as double precision) as "totalAmount"
       from public.loans
       where disbursed_at is not null
         and ($1::timestamptz is null or disbursed_at >= $1::timestamptz)
         and ($2::timestamptz is null or disbursed_at <= $2::timestamptz)
       group by 1
       order by 1 asc`,
      [startDate ?? null, endDate ?? null],
    );
  }

  async demographic(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    const total = await this.db.queryOne<{ totalClients: number }>(`select cast(count(*) as int) as "totalClients" from public.clients`);
    const byGender = await this.db.query<{ label: string; count: number }>(
      `select coalesce(nullif(trim(gender), ''), 'Unspecified') as label, cast(count(*) as int) as count from public.clients group by 1 order by count desc`,
    );
    const flags = await this.db.queryOne<{ blackWomenOwned: number; hdp: number; disabled: number; rural: number }>(
      `select cast(count(*) filter (where is_black_women_owned) as int) as "blackWomenOwned",
              cast(count(*) filter (where is_hdp) as int) as "hdp",
              cast(count(*) filter (where is_disabled) as int) as "disabled",
              cast(count(*) filter (where is_rural) as int) as "rural"
       from public.clients`,
    );
    return {
      totalClients: total?.totalClients ?? 0,
      byGender,
      flags: [
        { label: 'Black Women-Owned', count: flags?.blackWomenOwned ?? 0 },
        { label: 'Historically Disadvantaged (HDP)', count: flags?.hdp ?? 0 },
        { label: 'Person with Disability', count: flags?.disabled ?? 0 },
        { label: 'Rural', count: flags?.rural ?? 0 },
      ],
    };
  }

  async debtorsAge(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    const rows = await this.db.query<{ bucket: string; installments: number; outstandingAmount: number }>(
      `select bucket, cast(count(*) as int) as installments, cast(coalesce(sum(outstanding), 0) as numeric(18,2)) as "outstandingAmount"
       from (
         select (due_total - paid_amount) as outstanding,
                case
                  when (current_date - due_date) <= 0 then 'Current (not overdue)'
                  when (current_date - due_date) between 1 and 30 then '1-30 days'
                  when (current_date - due_date) between 31 and 60 then '31-60 days'
                  when (current_date - due_date) between 61 and 90 then '61-90 days'
                  when (current_date - due_date) between 91 and 120 then '91-120 days'
                  else '120+ days'
                end as bucket
         from public.repayment_schedule
         where due_total > paid_amount
       ) sub
       group by bucket`,
    );
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    return DEBTORS_AGE_BUCKETS.map((bucket) => ({
      bucket,
      installments: byBucket.get(bucket)?.installments ?? 0,
      outstandingAmount: byBucket.get(bucket)?.outstandingAmount ?? 0,
    }));
  }

  async province(actor: CurrentUser) {
    await this.ensureStaffActor(actor);
    const total = await this.db.queryOne<{ totalClients: number }>(`select cast(count(*) as int) as "totalClients" from public.clients`);
    const byProvince = await this.db.query<{ label: string; count: number }>(
      `select coalesce(nullif(trim(province), ''), 'Unspecified') as label, cast(count(*) as int) as count from public.clients group by 1 order by count desc`,
    );
    const bySpatialType = await this.db.query<{ label: string; count: number }>(
      `select coalesce(nullif(trim(spatial_type), ''), 'Unspecified') as label, cast(count(*) as int) as count from public.clients group by 1 order by count desc`,
    );
    return { totalClients: total?.totalClients ?? 0, byProvince, bySpatialType };
  }
}
