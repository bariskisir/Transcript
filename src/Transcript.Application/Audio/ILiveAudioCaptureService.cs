namespace Transcript.Application.Audio;

/// <summary>
/// Captures live audio from selected platform devices.
/// </summary>
public interface ILiveAudioCaptureService : IAsyncDisposable
{
    /// <summary>
    /// Gets a value indicating whether capture is active.
    /// </summary>
    bool IsRunning { get; }

    /// <summary>
    /// Starts capture for the requested audio sources.
    /// </summary>
    /// <param name="selection">The selected audio devices and source flags.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>An asynchronous stream of PCM frames.</returns>
    IAsyncEnumerable<AudioFrame> StartAsync(AudioDeviceSelection selection, CancellationToken cancellationToken = default);

    /// <summary>
    /// Stops any active capture resources.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes once capture is stopped.</returns>
    Task StopAsync(CancellationToken cancellationToken = default);
}
