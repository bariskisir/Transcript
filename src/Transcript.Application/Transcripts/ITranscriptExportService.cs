using Transcript.Domain.Transcripts;

namespace Transcript.Application.Transcripts;

/// <summary>
/// Exports transcripts into user-selected file formats.
/// </summary>
public interface ITranscriptExportService
{
    /// <summary>
    /// Exports a transcript to the requested path.
    /// </summary>
    /// <param name="transcript">The transcript to export.</param>
    /// <param name="format">The export format.</param>
    /// <param name="destinationPath">The destination file path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes once the file is written.</returns>
    Task ExportAsync(TranscriptRecord transcript, ExportFormat format, string destinationPath, CancellationToken cancellationToken = default);

    /// <summary>
    /// Renders a transcript to a string.
    /// </summary>
    /// <param name="transcript">The transcript to render.</param>
    /// <param name="format">The export format.</param>
    /// <returns>The rendered transcript.</returns>
    string Render(TranscriptRecord transcript, ExportFormat format);
}
