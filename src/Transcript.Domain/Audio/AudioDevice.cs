namespace Transcript.Domain.Audio;

/// <summary>
/// Describes an audio endpoint that can be selected by the desktop application.
/// </summary>
/// <param name="Id">The stable platform-specific identifier.</param>
/// <param name="Name">The human-readable endpoint name.</param>
/// <param name="Kind">The source kind represented by the endpoint.</param>
/// <param name="IsDefault">Whether the operating system marks this endpoint as the default.</param>
/// <param name="IsAvailable">Whether Transcript can capture from this endpoint on the current platform.</param>
public sealed record AudioDevice(
    string Id,
    string Name,
    AudioSourceKind Kind,
    bool IsDefault,
    bool IsAvailable);
