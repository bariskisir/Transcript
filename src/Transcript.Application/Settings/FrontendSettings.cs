namespace Transcript.Application.Settings;

/// <summary>
/// Settings that can be edited from the presentation layer without implicitly saving API keys.
/// </summary>
public sealed class FrontendSettings
{
    /// <summary>
    /// Gets or sets the selected speaker device identifier.
    /// </summary>
    public string SpeakerDeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the selected microphone device identifier.
    /// </summary>
    public string MicrophoneDeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the selected language code.
    /// </summary>
    public string Language { get; set; } = "en-US";

    /// <summary>
    /// Gets or sets a value indicating whether speaker capture is enabled.
    /// </summary>
    public bool SpeakerEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether microphone capture is enabled.
    /// </summary>
    public bool MicrophoneEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the window should remain above other windows.
    /// </summary>
    public bool AlwaysOnTop { get; set; }

    /// <summary>
    /// Gets or sets the preferred export directory.
    /// </summary>
    public string OutputDirectory { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the theme name.
    /// </summary>
    public string Theme { get; set; } = "System";
}
