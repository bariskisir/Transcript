using Transcript.Domain.Audio;

namespace Transcript.Application.Audio;

/// <summary>
/// Lists audio devices exposed by the current platform.
/// </summary>
public interface IAudioDeviceService
{
    /// <summary>
    /// Lists selectable audio devices.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The audio devices available to the application.</returns>
    Task<IReadOnlyList<AudioDevice>> ListDevicesAsync(CancellationToken cancellationToken = default);
}
