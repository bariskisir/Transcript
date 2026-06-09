using Transcript.Domain.Audio;
using Transcript.Domain.Settings;
using Transcript.Domain.Transcription;

namespace Transcript.Application.Transcripts;

/// <summary>
/// Represents the complete state needed by the presentation layer.
/// </summary>
public sealed class AppViewState
{
    /// <summary>
    /// Gets or sets persisted application settings.
    /// </summary>
    public AppSettings Settings { get; set; } = new();

    /// <summary>
    /// Gets or sets the user-facing status message.
    /// </summary>
    public string Status { get; set; } = "Ready.";

    /// <summary>
    /// Gets or sets the Deepgram account balance label.
    /// </summary>
    public string Balance { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the available transcript summaries.
    /// </summary>
    public IReadOnlyList<TranscriptSummary> Transcripts { get; set; } = [];

    /// <summary>
    /// Gets or sets the active transcript identifier.
    /// </summary>
    public string ActiveTranscriptId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the zero-based active transcript index.
    /// </summary>
    public int ActiveIndex { get; set; }

    /// <summary>
    /// Gets or sets the total transcript count.
    /// </summary>
    public int TranscriptCount { get; set; }

    /// <summary>
    /// Gets or sets active transcript text.
    /// </summary>
    public string TranscriptText { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets available audio devices.
    /// </summary>
    public IReadOnlyList<AudioDevice> Devices { get; set; } = [];

    /// <summary>
    /// Gets or sets supported language options.
    /// </summary>
    public IReadOnlyList<LanguageOption> Languages { get; set; } = [];

    /// <summary>
    /// Gets or sets a value indicating whether live capture is running.
    /// </summary>
    public bool Running { get; set; }
}
