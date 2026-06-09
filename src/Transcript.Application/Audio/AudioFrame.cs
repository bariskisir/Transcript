using Transcript.Domain.Audio;

namespace Transcript.Application.Audio;

/// <summary>
/// Represents one chunk of encoded audio sent to the transcription provider.
/// </summary>
/// <param name="SourceKind">The source kind that produced the audio.</param>
/// <param name="SourceLabel">The display source label.</param>
/// <param name="Pcm16Mono16Khz">The audio payload as 16 kHz mono little-endian PCM16.</param>
public sealed record AudioFrame(AudioSourceKind SourceKind, string SourceLabel, byte[] Pcm16Mono16Khz);
