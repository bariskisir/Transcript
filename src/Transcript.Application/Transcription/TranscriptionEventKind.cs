namespace Transcript.Application.Transcription;

/// <summary>
/// Categorizes transcription events.
/// </summary>
public enum TranscriptionEventKind
{
    /// <summary>
    /// Informational status text.
    /// </summary>
    Status,

    /// <summary>
    /// Interim transcript text.
    /// </summary>
    Interim,

    /// <summary>
    /// Final transcript text.
    /// </summary>
    Final,

    /// <summary>
    /// Provider or capture error.
    /// </summary>
    Error
}
