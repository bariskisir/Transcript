namespace Transcript.Domain.Transcripts;

/// <summary>
/// Supported transcript export formats.
/// </summary>
public enum ExportFormat
{
    /// <summary>
    /// Plain text output.
    /// </summary>
    Text,

    /// <summary>
    /// Markdown output.
    /// </summary>
    Markdown,

    /// <summary>
    /// JSON output.
    /// </summary>
    Json,

    /// <summary>
    /// SubRip subtitle output.
    /// </summary>
    Srt
}
