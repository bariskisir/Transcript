using Transcript.Application.Settings;
using Transcript.Application.Transcripts;
using Transcript.Domain.Transcripts;

namespace Transcript.Application.UseCases;

/// <summary>
/// Coordinates the primary Transcript user workflow.
/// </summary>
public interface ITranscriptWorkspaceService : IAsyncDisposable
{
    /// <summary>
    /// Raised when user-visible workspace state changes.
    /// </summary>
    event EventHandler<WorkspaceChangedEventArgs>? StateChanged;

    /// <summary>
    /// Raised when interim transcript text changes.
    /// </summary>
    event EventHandler<InterimTranscriptEventArgs>? InterimTranscriptChanged;

    /// <summary>
    /// Initializes settings, devices, and transcripts.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The initial view state.</returns>
    Task<AppViewState> InitializeAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the latest view state.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The current view state.</returns>
    Task<AppViewState> GetStateAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves presentation-editable settings.
    /// </summary>
    /// <param name="settings">The settings payload.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> SaveSettingsAsync(FrontendSettings settings, CancellationToken cancellationToken = default);

    /// <summary>
    /// Validates and saves the Deepgram API key.
    /// </summary>
    /// <param name="apiKey">The API key to validate.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> TestAndSaveApiKeyAsync(string apiKey, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a new transcript.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> CreateTranscriptAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes the active transcript when allowed.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> DeleteActiveTranscriptAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Selects a transcript by relative list offset.
    /// </summary>
    /// <param name="offset">The relative offset.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> SelectTranscriptByOffsetAsync(int offset, CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves edited text for the active transcript.
    /// </summary>
    /// <param name="text">The edited text.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> SaveActiveTranscriptTextAsync(string text, CancellationToken cancellationToken = default);

    /// <summary>
    /// Starts live transcription.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> StartLiveTranscriptionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Stops live transcription.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> StopLiveTranscriptionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Imports and transcribes an audio file into the active transcript.
    /// </summary>
    /// <param name="filePath">The audio file path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> ImportAudioFileAsync(string filePath, CancellationToken cancellationToken = default);

    /// <summary>
    /// Exports the active transcript.
    /// </summary>
    /// <param name="format">The export format.</param>
    /// <param name="destinationPath">The destination file path.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The updated view state.</returns>
    Task<AppViewState> ExportActiveTranscriptAsync(ExportFormat format, string destinationPath, CancellationToken cancellationToken = default);
}
