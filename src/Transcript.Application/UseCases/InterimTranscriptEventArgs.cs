namespace Transcript.Application.UseCases;

/// <summary>
/// Provides interim transcript text.
/// </summary>
/// <param name="Text">The interim text.</param>
public sealed class InterimTranscriptEventArgs(string Text) : EventArgs
{
    /// <summary>
    /// Gets the interim text.
    /// </summary>
    public string Text { get; } = Text;
}
