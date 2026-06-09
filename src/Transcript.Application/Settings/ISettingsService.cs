using Transcript.Domain.Settings;

namespace Transcript.Application.Settings;

/// <summary>
/// Loads and saves application settings.
/// </summary>
public interface ISettingsService
{
    /// <summary>
    /// Loads persisted settings, creating defaults on first run.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The loaded settings.</returns>
    Task<AppSettings> LoadAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves application settings.
    /// </summary>
    /// <param name="settings">The settings to save.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes once settings are saved.</returns>
    Task SaveAsync(AppSettings settings, CancellationToken cancellationToken = default);
}
