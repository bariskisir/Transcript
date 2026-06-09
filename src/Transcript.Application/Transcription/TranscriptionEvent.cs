namespace Transcript.Application.Transcription;

/// <summary>
/// Represents one provider event produced while transcribing.
/// </summary>
public sealed class TranscriptionEvent
{
    private TranscriptionEvent(TranscriptionEventKind kind, string source, string text, string message, TimeSpan? startedAt, TimeSpan? endedAt)
    {
        Kind = kind;
        Source = source;
        Text = text;
        Message = message;
        StartedAt = startedAt;
        EndedAt = endedAt;
    }

    /// <summary>
    /// Gets the event kind.
    /// </summary>
    public TranscriptionEventKind Kind { get; }

    /// <summary>
    /// Gets the source label.
    /// </summary>
    public string Source { get; }

    /// <summary>
    /// Gets the transcript text.
    /// </summary>
    public string Text { get; }

    /// <summary>
    /// Gets the status or error message.
    /// </summary>
    public string Message { get; }

    /// <summary>
    /// Gets the optional audio-relative start time.
    /// </summary>
    public TimeSpan? StartedAt { get; }

    /// <summary>
    /// Gets the optional audio-relative end time.
    /// </summary>
    public TimeSpan? EndedAt { get; }

    /// <summary>
    /// Creates a status event.
    /// </summary>
    /// <param name="message">The status message.</param>
    /// <returns>A status event.</returns>
    public static TranscriptionEvent Status(string message) => new(TranscriptionEventKind.Status, string.Empty, string.Empty, message, null, null);

    /// <summary>
    /// Creates an interim transcript event.
    /// </summary>
    /// <param name="source">The source label.</param>
    /// <param name="text">The interim text.</param>
    /// <returns>An interim event.</returns>
    public static TranscriptionEvent Interim(string source, string text) => new(TranscriptionEventKind.Interim, source, text, string.Empty, null, null);

    /// <summary>
    /// Creates a final transcript event.
    /// </summary>
    /// <param name="source">The source label.</param>
    /// <param name="text">The final text.</param>
    /// <param name="startedAt">The optional start time.</param>
    /// <param name="endedAt">The optional end time.</param>
    /// <returns>A final event.</returns>
    public static TranscriptionEvent Final(string source, string text, TimeSpan? startedAt = null, TimeSpan? endedAt = null) =>
        new(TranscriptionEventKind.Final, source, text, string.Empty, startedAt, endedAt);

    /// <summary>
    /// Creates an error event.
    /// </summary>
    /// <param name="message">The error message.</param>
    /// <returns>An error event.</returns>
    public static TranscriptionEvent Error(string message) => new(TranscriptionEventKind.Error, string.Empty, string.Empty, message, null, null);
}
