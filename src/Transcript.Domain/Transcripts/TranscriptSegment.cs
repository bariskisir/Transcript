namespace Transcript.Domain.Transcripts;

/// <summary>
/// Represents one final transcript segment.
/// </summary>
/// <param name="Id">The segment number within the transcript.</param>
/// <param name="Source">The source label.</param>
/// <param name="Text">The final transcript text.</param>
/// <param name="CreatedAt">The persistence timestamp.</param>
/// <param name="StartedAt">The optional audio-relative start time.</param>
/// <param name="EndedAt">The optional audio-relative end time.</param>
public sealed record TranscriptSegment(
    int Id,
    string Source,
    string Text,
    DateTimeOffset CreatedAt,
    TimeSpan? StartedAt,
    TimeSpan? EndedAt);
