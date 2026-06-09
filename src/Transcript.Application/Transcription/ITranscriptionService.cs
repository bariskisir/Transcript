using Transcript.Application.Audio;
using Transcript.Domain.Transcripts;

namespace Transcript.Application.Transcription;

/// <summary>
/// Talks to the transcription provider.
/// </summary>
public interface ITranscriptionService
{
    /// <summary>
    /// Validates an API key and returns account information.
    /// </summary>
    /// <param name="apiKey">The API key to validate.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The validation result.</returns>
    Task<DeepgramAccountStatus> TestApiKeyAsync(string apiKey, CancellationToken cancellationToken = default);

    /// <summary>
    /// Streams live audio frames to the transcription provider.
    /// </summary>
    /// <param name="apiKey">The API key.</param>
    /// <param name="language">The language code.</param>
    /// <param name="frames">The live audio frames.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>Provider transcription events.</returns>
    IAsyncEnumerable<TranscriptionEvent> StreamLiveAsync(string apiKey, string language, IAsyncEnumerable<AudioFrame> frames, CancellationToken cancellationToken = default);

    /// <summary>
    /// Transcribes a prerecorded audio file.
    /// </summary>
    /// <param name="apiKey">The API key.</param>
    /// <param name="language">The language code.</param>
    /// <param name="filePath">The audio file path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The transcribed final segments.</returns>
    Task<IReadOnlyList<TranscriptSegment>> TranscribeFileAsync(string apiKey, string language, string filePath, CancellationToken cancellationToken = default);
}
