namespace Transcript.Application.Transcripts;

/// <summary>
/// Compact transcript metadata used by lists.
/// </summary>
/// <param name="Id">The transcript identifier.</param>
/// <param name="Label">The display label.</param>
/// <param name="Title">The transcript title.</param>
public sealed record TranscriptSummary(string Id, string Label, string Title);
