using System.Text.Json;
using Microsoft.Extensions.Logging;
using Transcript.Application.Abstractions;
using Transcript.Application.Settings;
using Transcript.Domain.Settings;

namespace Transcript.Infrastructure.Settings;

/// <summary>
/// Stores application settings in AppData as JSON.
/// </summary>
public sealed class JsonSettingsService : ISettingsService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly IAppPathProvider pathProvider;
    private readonly ILogger<JsonSettingsService> logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="JsonSettingsService" /> class.
    /// </summary>
    /// <param name="pathProvider">The application path provider.</param>
    /// <param name="logger">The logger.</param>
    public JsonSettingsService(IAppPathProvider pathProvider, ILogger<JsonSettingsService> logger)
    {
        this.pathProvider = pathProvider;
        this.logger = logger;
    }

    /// <inheritdoc />
    public async Task<AppSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        var file = pathProvider.SettingsFile;
        if (!file.Exists)
        {
            var defaults = new AppSettings();
            await SaveAsync(defaults, cancellationToken).ConfigureAwait(false);
            return defaults;
        }

        try
        {
            await using var stream = file.OpenRead();
            var settings = await JsonSerializer.DeserializeAsync<AppSettings>(stream, SerializerOptions, cancellationToken)
                .ConfigureAwait(false) ?? new AppSettings();
            settings.Normalize();
            return settings;
        }
        catch (Exception error) when (error is JsonException or IOException or UnauthorizedAccessException)
        {
            var backup = Path.Combine(file.DirectoryName!, $"settings.{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.bak.json");
            logger.LogWarning(error, "Settings file was invalid; backing it up to {BackupPath}.", backup);
            File.Copy(file.FullName, backup, overwrite: true);
            var defaults = new AppSettings();
            await SaveAsync(defaults, cancellationToken).ConfigureAwait(false);
            return defaults;
        }
    }

    /// <inheritdoc />
    public async Task SaveAsync(AppSettings settings, CancellationToken cancellationToken = default)
    {
        settings.Normalize();
        var file = pathProvider.SettingsFile;
        Directory.CreateDirectory(file.DirectoryName!);
        var tempPath = $"{file.FullName}.tmp";
        await using (var stream = File.Create(tempPath))
        {
            await JsonSerializer.SerializeAsync(stream, settings, SerializerOptions, cancellationToken).ConfigureAwait(false);
        }

        File.Move(tempPath, file.FullName, overwrite: true);
    }
}
