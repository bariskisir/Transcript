using Transcript.Domain.Transcripts;

namespace Transcript.Application.Transcripts;

/// <summary>
/// Persists transcript records.
/// </summary>
public interface ITranscriptRepository
{
    /// <summary>
    /// Loads all transcript records.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The saved transcript records.</returns>
    Task<IReadOnlyList<TranscriptRecord>> LoadAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads one transcript by identifier.
    /// </summary>
    /// <param name="id">The transcript identifier.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The transcript when found; otherwise <see langword="null" />.</returns>
    Task<TranscriptRecord?> LoadAsync(string id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves a transcript record.
    /// </summary>
    /// <param name="transcript">The transcript to save.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes once the transcript is saved.</returns>
    Task SaveAsync(TranscriptRecord transcript, CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes a transcript record.
    /// </summary>
    /// <param name="id">The transcript identifier.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes once the transcript is deleted.</returns>
    Task DeleteAsync(string id, CancellationToken cancellationToken = default);
}
