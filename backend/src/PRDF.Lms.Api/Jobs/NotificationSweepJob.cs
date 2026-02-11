using Quartz;
using PRDF.Lms.Application.Notifications;

namespace PRDF.Lms.Api.Jobs;

public sealed class NotificationSweepJob(INotificationService notificationService) : IJob
{
    public async Task Execute(IJobExecutionContext context)
    {
        await notificationService.RunReminderScansAsync(context.CancellationToken);
    }
}
