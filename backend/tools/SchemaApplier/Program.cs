using Npgsql;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: SchemaApplier <connectionString> <sqlFilePath>");
    return 1;
}

var connectionString = args[0];
var sqlFilePath = args[1];

if (!File.Exists(sqlFilePath))
{
    Console.Error.WriteLine($"SQL file not found: {sqlFilePath}");
    return 1;
}

var sql = await File.ReadAllTextAsync(sqlFilePath);

await using var connection = new NpgsqlConnection(connectionString);
await connection.OpenAsync();
await using var command = new NpgsqlCommand(sql, connection);
await command.ExecuteNonQueryAsync();

Console.WriteLine("Schema applied successfully.");
return 0;
