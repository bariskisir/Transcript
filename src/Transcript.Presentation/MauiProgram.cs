using Serilog;
using Transcript.Infrastructure.DependencyInjection;

namespace Transcript.Presentation;

/// <summary>
/// Configures the MAUI application host.
/// </summary>
public static class MauiProgram
{
    /// <summary>
    /// Creates and configures the MAUI application.
    /// </summary>
    /// <returns>The configured MAUI app.</returns>
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

        builder.Services.AddTranscriptLogging();
        builder.Services.AddTranscriptInfrastructure();
        builder.Services.AddSingleton<MainPage>();

        RegisterGlobalExceptionHandlers();
        return builder.Build();
    }

    private static void RegisterGlobalExceptionHandlers()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception exception)
            {
                Log.Error(exception, "Unhandled AppDomain exception.");
            }
        };
        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            Log.Error(args.Exception, "Unobserved task exception.");
            args.SetObserved();
        };
    }
}
