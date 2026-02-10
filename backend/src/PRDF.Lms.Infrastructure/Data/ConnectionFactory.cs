using Microsoft.Extensions.Options;
using Npgsql;
using PRDF.Lms.Infrastructure.Configuration;

namespace PRDF.Lms.Infrastructure.Data;

public interface IConnectionFactory
{
    NpgsqlConnection CreateConnection();
}

public sealed class ConnectionFactory(IOptions<DatabaseOptions> options) : IConnectionFactory
{
    private readonly string _connectionString =
        options.Value.ConnectionString;

    public NpgsqlConnection CreateConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Database connection string is not configured. Set SUPABASE_DB_CONNECTION_STRING.");
        }

        return new NpgsqlConnection(_connectionString);
    }
}
