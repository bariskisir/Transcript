namespace Transcript.Application.Abstractions;

/// <summary>
/// Resolves application data paths.
/// </summary>
public interface IAppPathProvider
{
    /// <summary>
    /// Gets the root application data directory.
    /// </summary>
    DirectoryInfo DataDirectory { get; }

    /// <summary>
    /// Gets the transcript data directory.
    /// </summary>
    DirectoryInfo TranscriptDirectory { get; }

    /// <summary>
    /// Gets the log directory.
    /// </summary>
    DirectoryInfo LogDirectory { get; }

    /// <summary>
    /// Gets the settings file path.
    /// </summary>
    FileInfo SettingsFile { get; }
}
