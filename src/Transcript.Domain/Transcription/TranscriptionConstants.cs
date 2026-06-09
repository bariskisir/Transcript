namespace Transcript.Domain.Transcription;

/// <summary>
/// Shared transcription constants.
/// </summary>
public static class TranscriptionConstants
{
    /// <summary>
    /// The display label for speaker audio.
    /// </summary>
    public const string SpeakerLabel = "Speaker";

    /// <summary>
    /// The display label for microphone audio.
    /// </summary>
    public const string MicrophoneLabel = "Microphone";

    /// <summary>
    /// The target sample rate sent to the transcription provider.
    /// </summary>
    public const int TargetSampleRate = 16_000;
}
