using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using Transcript.Application.Abstractions;
using Transcript.Application.Audio;
using Transcript.Application.Settings;
using Transcript.Application.Transcription;
using Transcript.Application.Transcripts;
using Transcript.Application.UseCases;
using Transcript.Infrastructure.Audio;
using Transcript.Infrastructure.Deepgram;
using Transcript.Infrastructure.Exports;
using Transcript.Infrastructure.Paths;
using Transcript.Infrastructure.Persistence;
using Transcript.Infrastructure.Settings;

namespace Transcript.Infrastructure.DependencyInjection;

/// <summary>
/// Registers Transcript infrastructure services.
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Adds infrastructure, application orchestration, and provider clients.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The same service collection.</returns>
    public static IServiceCollection AddTranscriptInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IAppPathProvider, AppPathProvider>();
        services.AddSingleton<ISettingsService, JsonSettingsService>();
        services.AddSingleton<ITranscriptRepository, JsonTranscriptRepository>();
        services.AddSingleton<ITranscriptExportService, TranscriptExportService>();
        services.AddSingleton<IAudioDeviceService, PlatformAudioDeviceService>();
        services.AddSingleton<ILiveAudioCaptureService, PlatformLiveAudioCaptureService>();
        services.AddSingleton<ITranscriptWorkspaceService, TranscriptWorkspaceService>();
        services.AddHttpClient<ITranscriptionService, DeepgramTranscriptionService>()
            .AddStandardResilienceHandler();
        return services;
    }

    /// <summary>
    /// Configures Microsoft logging to use Serilog file logs in AppData.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The same service collection.</returns>
    public static IServiceCollection AddTranscriptLogging(this IServiceCollection services)
    {
        var pathProvider = new AppPathProvider();
        var logPath = Path.Combine(pathProvider.LogDirectory.FullName, "transcript-.log");
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .Enrich.FromLogContext()
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .CreateLogger();

        services.AddLogging(builder =>
        {
            builder.ClearProviders();
            builder.AddSerilog(Log.Logger, dispose: true);
        });
        return services;
    }
}
