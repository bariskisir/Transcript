namespace Transcript.Application.Audio;

/// <summary>
/// Captures selected audio device settings.
/// </summary>
/// <param name="SpeakerDeviceId">The selected speaker device identifier.</param>
/// <param name="MicrophoneDeviceId">The selected microphone device identifier.</param>
/// <param name="SpeakerEnabled">Whether speaker capture is enabled.</param>
/// <param name="MicrophoneEnabled">Whether microphone capture is enabled.</param>
public sealed record AudioDeviceSelection(
    string SpeakerDeviceId,
    string MicrophoneDeviceId,
    bool SpeakerEnabled,
    bool MicrophoneEnabled);
