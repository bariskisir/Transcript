using Transcript.Application.Abstractions;

namespace Transcript.Infrastructure.Paths;

/// <summary>
/// Resolves operating-system application data paths for Transcript.
/// </summary>
public sealed class AppPathProvider : IAppPathProvider
{
    private readonly Lazy<DirectoryInfo> dataDirectory;
    private readonly Lazy<DirectoryInfo> transcriptDirectory;
    private readonly Lazy<DirectoryInfo> logDirectory;

    /// <summary>
    /// Initializes a new instance of the <see cref="AppPathProvider" /> class.
    /// </summary>
    public AppPathProvider()
    {
        dataDirectory = new Lazy<DirectoryInfo>(() => EnsureDirectory(Path.Combine(RootDataPath(), "Transcript")));
        transcriptDirectory = new Lazy<DirectoryInfo>(() => EnsureDirectory(Path.Combine(DataDirectory.FullName, "transcripts")));
        logDirectory = new Lazy<DirectoryInfo>(() => EnsureDirectory(Path.Combine(DataDirectory.FullName, "logs")));
    }

    /// <inheritdoc />
    public DirectoryInfo DataDirectory => dataDirectory.Value;

    /// <inheritdoc />
    public DirectoryInfo TranscriptDirectory => transcriptDirectory.Value;

    /// <inheritdoc />
    public DirectoryInfo LogDirectory => logDirectory.Value;

    /// <inheritdoc />
    public FileInfo SettingsFile => new(Path.Combine(DataDirectory.FullName, "settings.json"));

    private static DirectoryInfo EnsureDirectory(string path)
    {
        return Directory.CreateDirectory(path);
    }

    private static string RootDataPath()
    {
        if (OperatingSystem.IsWindows())
        {
            return Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        }

        if (OperatingSystem.IsMacOS() || OperatingSystem.IsMacCatalyst())
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Library",
                "Application Support");
        }

        var xdg = Environment.GetEnvironmentVariable("XDG_DATA_HOME");
        return string.IsNullOrWhiteSpace(xdg)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share")
            : xdg;
    }
}
