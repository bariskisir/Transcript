namespace Transcript.Domain.Transcripts;

/// <summary>
/// Creates filesystem-safe transcript identifiers.
/// </summary>
public static class TranscriptId
{
    /// <summary>
    /// Creates a new sortable transcript identifier.
    /// </summary>
    /// <returns>A unique transcript identifier.</returns>
    public static string NewId() => $"{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}";
}
