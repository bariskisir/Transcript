using NAudio.CoreAudioApi;
using Transcript.Application.Audio;
using Transcript.Domain.Audio;

namespace Transcript.Infrastructure.Audio;

/// <summary>
/// Lists platform audio devices.
/// </summary>
public sealed class PlatformAudioDeviceService : IAudioDeviceService
{
    /// <inheritdoc />
    public Task<IReadOnlyList<AudioDevice>> ListDevicesAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!OperatingSystem.IsWindows())
        {
            return Task.FromResult<IReadOnlyList<AudioDevice>>([
                new AudioDevice("default-microphone", "Default Microphone", AudioSourceKind.Microphone, true, false),
                new AudioDevice("system-audio", "System Audio", AudioSourceKind.Speaker, true, false)
            ]);
        }

        using var enumerator = new MMDeviceEnumerator();
        var devices = new List<AudioDevice>();
        var defaultCaptureId = TryDefaultId(enumerator, DataFlow.Capture);
        var defaultRenderId = TryDefaultId(enumerator, DataFlow.Render);
        devices.AddRange(Enumerate(enumerator, DataFlow.Capture, AudioSourceKind.Microphone, defaultCaptureId, true));
        devices.AddRange(Enumerate(enumerator, DataFlow.Render, AudioSourceKind.Speaker, defaultRenderId, true));
        return Task.FromResult<IReadOnlyList<AudioDevice>>(devices);
    }

    private static IEnumerable<AudioDevice> Enumerate(MMDeviceEnumerator enumerator, DataFlow dataFlow, AudioSourceKind kind, string defaultId, bool available)
    {
        foreach (var device in enumerator.EnumerateAudioEndPoints(dataFlow, DeviceState.Active))
        {
            yield return new AudioDevice(device.ID, device.FriendlyName, kind, string.Equals(device.ID, defaultId, StringComparison.Ordinal), available);
        }
    }

    private static string TryDefaultId(MMDeviceEnumerator enumerator, DataFlow dataFlow)
    {
        try
        {
            return enumerator.GetDefaultAudioEndpoint(dataFlow, Role.Multimedia).ID;
        }
        catch
        {
            return string.Empty;
        }
    }
}
