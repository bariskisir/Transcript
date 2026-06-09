namespace Transcript.Domain.Audio;

/// <summary>
/// Identifies the source category for captured audio.
/// </summary>
public enum AudioSourceKind
{
    /// <summary>
    /// System output or speaker loopback audio.
    /// </summary>
    Speaker,

    /// <summary>
    /// Microphone or other input audio.
    /// </summary>
    Microphone
}
