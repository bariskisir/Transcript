namespace Transcript.Domain.Transcription;

/// <summary>
/// Represents one selectable transcription language.
/// </summary>
/// <param name="Value">The provider language code.</param>
/// <param name="Label">The display label.</param>
/// <param name="Model">An optional provider model override.</param>
public sealed record LanguageOption(string Value, string Label, string? Model);
