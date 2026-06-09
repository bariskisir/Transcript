namespace Transcript.Domain.Transcripts;

/// <summary>
/// Represents a saved transcript and its final text segments.
/// </summary>
public sealed class TranscriptRecord
{
    /// <summary>
    /// Gets or sets the transcript identifier.
    /// </summary>
    public string Id { get; set; } = TranscriptId.NewId();

    /// <summary>
    /// Gets or sets the creation timestamp.
    /// </summary>
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Gets or sets the last update timestamp.
    /// </summary>
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Gets or sets the selected language for this transcript.
    /// </summary>
    public string Language { get; set; } = "en-US";

    /// <summary>
    /// Gets or sets the transcript display title.
    /// </summary>
    public string Title { get; set; } = "Untitled Transcript";

    /// <summary>
    /// Gets the transcript segments.
    /// </summary>
    public List<TranscriptSegment> Segments { get; init; } = [];

    /// <summary>
    /// Returns whether the transcript has no meaningful text.
    /// </summary>
    /// <returns><see langword="true" /> when no segment contains text.</returns>
    public bool IsEmpty() => Segments.All(segment => string.IsNullOrWhiteSpace(segment.Text));

    /// <summary>
    /// Appends a final segment to this transcript.
    /// </summary>
    /// <param name="source">The source label.</param>
    /// <param name="text">The final transcript text.</param>
    /// <param name="startedAt">The optional audio-relative start time.</param>
    /// <param name="endedAt">The optional audio-relative end time.</param>
    public void AddSegment(string source, string text, TimeSpan? startedAt = null, TimeSpan? endedAt = null)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        Segments.Add(new TranscriptSegment(
            Segments.Count + 1,
            string.IsNullOrWhiteSpace(source) ? "Unknown" : source.Trim(),
            text.Trim(),
            DateTimeOffset.UtcNow,
            startedAt,
            endedAt));
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Replaces the segment collection with edited text as a single user segment.
    /// </summary>
    /// <param name="text">The edited transcript text.</param>
    public void ReplaceText(string text)
    {
        Segments.Clear();
        if (!string.IsNullOrWhiteSpace(text))
        {
            AddSegment("Edited", text);
        }

        UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Returns the transcript text joined for display.
    /// </summary>
    /// <returns>The readable transcript text.</returns>
    public string ToDisplayText()
    {
        return string.Join(" ", Segments.Select(segment => segment.Text.Trim()).Where(text => text.Length > 0));
    }

    /// <summary>
    /// Returns a compact list label for this transcript.
    /// </summary>
    /// <returns>The formatted transcript label.</returns>
    public string ToListLabel()
    {
        var timestamp = IsEmpty() ? CreatedAt : UpdatedAt;
        return $"{timestamp.LocalDateTime:dd.MM - HH:mm}";
    }
}
