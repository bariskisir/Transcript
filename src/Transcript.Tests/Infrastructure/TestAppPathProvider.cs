using Transcript.Application.Abstractions;

namespace Transcript.Tests.Infrastructure;

internal sealed class TestAppPathProvider : IAppPathProvider, IDisposable
{
    private readonly DirectoryInfo root;

    public TestAppPathProvider()
    {
        root = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), "TranscriptTests", Guid.NewGuid().ToString("N")));
        TranscriptDirectory = Directory.CreateDirectory(Path.Combine(root.FullName, "transcripts"));
        LogDirectory = Directory.CreateDirectory(Path.Combine(root.FullName, "logs"));
        SettingsFile = new FileInfo(Path.Combine(root.FullName, "settings.json"));
    }

    public DirectoryInfo DataDirectory => root;

    public DirectoryInfo TranscriptDirectory { get; }

    public DirectoryInfo LogDirectory { get; }

    public FileInfo SettingsFile { get; }

    public void Dispose()
    {
        if (root.Exists)
        {
            root.Delete(recursive: true);
        }
    }
}
