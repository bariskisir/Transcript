using Transcript.Domain.Transcription;

namespace Transcript.Domain.Settings;

/// <summary>
/// User-editable settings persisted in the application data directory.
/// </summary>
public sealed class AppSettings
{
    /// <summary>
    /// Gets or sets the Deepgram API key.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the selected speaker device identifier.
    /// </summary>
    public string SpeakerDeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the selected microphone device identifier.
    /// </summary>
    public string MicrophoneDeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the selected Deepgram language code.
    /// </summary>
    public string Language { get; set; } = LanguageCatalog.DefaultLanguage;

    /// <summary>
    /// Gets or sets a value indicating whether speaker capture is enabled.
    /// </summary>
    public bool SpeakerEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether microphone capture is enabled.
    /// </summary>
    public bool MicrophoneEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the app window should stay above other windows.
    /// </summary>
    public bool AlwaysOnTop { get; set; }

    /// <summary>
    /// Gets or sets the active transcript identifier.
    /// </summary>
    public string ActiveTranscriptId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the preferred output directory for exported transcripts.
    /// </summary>
    public string OutputDirectory { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the UI theme name.
    /// </summary>
    public string Theme { get; set; } = "System";

    /// <summary>
    /// Normalizes setting values that must remain within supported ranges.
    /// </summary>
    public void Normalize()
    {
        Language = LanguageCatalog.Normalize(Language);
        Theme = string.IsNullOrWhiteSpace(Theme) ? "System" : Theme.Trim();
    }
}
