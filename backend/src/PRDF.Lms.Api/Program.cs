using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using FluentValidation;
using System.Text.Json.Serialization;
using Quartz;
using Serilog;
using PRDF.Lms.Application.Abstractions.Auth;
using PRDF.Lms.Application.Applications;
using PRDF.Lms.Application.Applications.Validators;
using PRDF.Lms.Application.Clients;
using PRDF.Lms.Application.Documents;
using PRDF.Lms.Application.Loans;
using PRDF.Lms.Application.Notifications;
using PRDF.Lms.Application.Reports;
using PRDF.Lms.Application.Tasks;
using PRDF.Lms.Api.Jobs;
using PRDF.Lms.Infrastructure.Applications;
using PRDF.Lms.Infrastructure.Authentication;
using PRDF.Lms.Infrastructure.Clients;
using PRDF.Lms.Infrastructure.Configuration;
using PRDF.Lms.Infrastructure.Data;
using PRDF.Lms.Infrastructure.Documents;
using PRDF.Lms.Infrastructure.Loans;
using PRDF.Lms.Infrastructure.Notifications;
using PRDF.Lms.Infrastructure.Reports;
using PRDF.Lms.Infrastructure.Tasks;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();
builder.Host.UseSerilog((context, services, configuration) =>
{
    configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console();
});

var supabaseUrl = builder.Configuration["SUPABASE_URL"]
    ?? builder.Configuration[$"{SupabaseOptions.SectionName}:Url"]
    ?? string.Empty;

var supabaseAudience = builder.Configuration["SUPABASE_JWT_AUDIENCE"]
    ?? builder.Configuration[$"{SupabaseOptions.SectionName}:JwtAudience"]
    ?? "authenticated";

builder.Services.Configure<SupabaseOptions>(options =>
{
    options.Url = supabaseUrl;
    options.AnonKey = builder.Configuration["SUPABASE_ANON_KEY"]
        ?? builder.Configuration[$"{SupabaseOptions.SectionName}:AnonKey"]
        ?? string.Empty;
    options.ServiceRoleKey = builder.Configuration["SUPABASE_SERVICE_ROLE_KEY"]
        ?? builder.Configuration[$"{SupabaseOptions.SectionName}:ServiceRoleKey"]
        ?? string.Empty;
    options.JwtAudience = supabaseAudience;
});
builder.Services.Configure<DatabaseOptions>(options =>
{
    options.ConnectionString = builder.Configuration["SUPABASE_DB_CONNECTION_STRING"]
        ?? builder.Configuration[$"{DatabaseOptions.SectionName}:ConnectionString"]
        ?? string.Empty;
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.AddHttpClient();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserContextAccessor, CurrentUserContextAccessor>();
builder.Services.AddScoped<IConnectionFactory, ConnectionFactory>();
builder.Services.AddScoped<ILoanApplicationService, LoanApplicationService>();
builder.Services.AddScoped<ILoanService, LoanService>();
builder.Services.AddScoped<IClientOnboardingService, ClientOnboardingService>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<IDocumentComplianceService, DocumentComplianceService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IReportingService, ReportingService>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateLoanApplicationRequestValidator>();
builder.Services.AddQuartz(options =>
{
    var jobKey = new JobKey("NotificationSweepJob");
    options.AddJob<NotificationSweepJob>(job => job.WithIdentity(jobKey));
    options.AddTrigger(trigger => trigger
        .ForJob(jobKey)
        .WithIdentity("NotificationSweepJob-trigger")
        .StartNow()
        .WithSimpleSchedule(schedule => schedule.WithIntervalInHours(1).RepeatForever()));
});
builder.Services.AddQuartzHostedService(options => options.WaitForJobsToComplete = true);
builder.Services.AddCors(options =>
{
    var allowedOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>() ?? ["http://localhost:5173"];

    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
            allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
            || IsLocalDevOrigin(origin))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

static bool IsLocalDevOrigin(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    return string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
        || string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase);
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        if (!string.IsNullOrWhiteSpace(supabaseUrl))
        {
            var issuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1";
            options.Authority = issuer;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = issuer,
                ValidateAudience = true,
                ValidAudience = supabaseAudience,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                NameClaimType = "sub",
                RoleClaimType = "role"
            };
        }
    });

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("FrontendPolicy");
app.UseSerilogRequestLogging();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
