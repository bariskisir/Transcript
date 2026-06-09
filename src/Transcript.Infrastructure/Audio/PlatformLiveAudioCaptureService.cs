using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Transcript.Application.Audio;
using Transcript.Domain.Audio;
using Transcript.Domain.Transcription;

namespace Transcript.Infrastructure.Audio;

/// <summary>
/// Captures live audio with platform-native adapters.
/// </summary>
public sealed class PlatformLiveAudioCaptureService : ILiveAudioCaptureService
{
    private static readonly byte[] SilentPcmFrame = new byte[TranscriptionConstants.TargetSampleRate / 10 * 2];
    private readonly ILogger<PlatformLiveAudioCaptureService> logger;
    private readonly List<IDisposable> captureResources = [];
    private Channel<AudioFrame>? channel;

    /// <summary>
    /// Initializes a new instance of the <see cref="PlatformLiveAudioCaptureService" /> class.
    /// </summary>
    /// <param name="logger">The logger.</param>
    public PlatformLiveAudioCaptureService(ILogger<PlatformLiveAudioCaptureService> logger)
    {
        this.logger = logger;
    }

    /// <inheritdoc />
    public bool IsRunning { get; private set; }

    /// <inheritdoc />
    public IAsyncEnumerable<AudioFrame> StartAsync(AudioDeviceSelection selection, CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Live audio capture is currently implemented for Windows desktop. macOS support requires a native AVFoundation/CoreAudio adapter.");
        }

        StopAsync(CancellationToken.None).GetAwaiter().GetResult();
        channel = Channel.CreateBounded<AudioFrame>(new BoundedChannelOptions(128)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });

        if (selection.MicrophoneEnabled)
        {
            StartMicrophone(selection.MicrophoneDeviceId, channel.Writer);
            WriteInitialSilence(AudioSourceKind.Microphone, TranscriptionConstants.MicrophoneLabel, channel.Writer);
        }

        if (selection.SpeakerEnabled)
        {
            StartSpeakerLoopback(selection.SpeakerDeviceId, channel.Writer);
            WriteInitialSilence(AudioSourceKind.Speaker, TranscriptionConstants.SpeakerLabel, channel.Writer);
        }

        IsRunning = captureResources.Count > 0;
        if (!IsRunning)
        {
            throw new InvalidOperationException("No audio source could be started.");
        }

        return channel.Reader.ReadAllAsync(cancellationToken);
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        foreach (var resource in captureResources)
        {
            try
            {
                resource.Dispose();
            }
            catch (Exception error)
            {
                logger.LogWarning(error, "Audio capture resource disposal failed.");
            }
        }

        captureResources.Clear();
        channel?.Writer.TryComplete();
        channel = null;
        IsRunning = false;
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await StopAsync(CancellationToken.None).ConfigureAwait(false);
    }

    private void StartMicrophone(string deviceId, ChannelWriter<AudioFrame> writer)
    {
        var deviceNumber = ResolveWaveInDeviceNumber(deviceId);
        var capture = new WaveInEvent
        {
            DeviceNumber = deviceNumber,
            WaveFormat = new WaveFormat(TranscriptionConstants.TargetSampleRate, 16, 1),
            BufferMilliseconds = 100
        };
        capture.DataAvailable += (_, args) =>
        {
            var pcm = PcmAudioConverter.ToPcm16Mono16Khz(args.Buffer, args.BytesRecorded, capture.WaveFormat);
            writer.TryWrite(new AudioFrame(AudioSourceKind.Microphone, TranscriptionConstants.MicrophoneLabel, pcm));
        };
        capture.RecordingStopped += (_, args) =>
        {
            if (args.Exception is not null)
            {
                logger.LogError(args.Exception, "Microphone capture stopped unexpectedly.");
            }
        };
        capture.StartRecording();
        captureResources.Add(capture);
    }

    private static void WriteInitialSilence(AudioSourceKind sourceKind, string sourceLabel, ChannelWriter<AudioFrame> writer)
    {
        // Loopback capture may not produce buffers until the system plays audio; this starts the matching Deepgram stream immediately.
        writer.TryWrite(new AudioFrame(sourceKind, sourceLabel, SilentPcmFrame.ToArray()));
    }

    private void StartSpeakerLoopback(string deviceId, ChannelWriter<AudioFrame> writer)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = ResolveRenderDevice(enumerator, deviceId);
        var capture = new WasapiLoopbackCapture(device);
        capture.DataAvailable += (_, args) =>
        {
            var pcm = PcmAudioConverter.ToPcm16Mono16Khz(args.Buffer, args.BytesRecorded, capture.WaveFormat);
            writer.TryWrite(new AudioFrame(AudioSourceKind.Speaker, TranscriptionConstants.SpeakerLabel, pcm));
        };
        capture.RecordingStopped += (_, args) =>
        {
            if (args.Exception is not null)
            {
                logger.LogError(args.Exception, "Speaker loopback capture stopped unexpectedly.");
            }
        };
        capture.StartRecording();
        captureResources.Add(capture);
    }

    private static int ResolveWaveInDeviceNumber(string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return 0;
        }

        for (var index = 0; index < WaveInEvent.DeviceCount; index++)
        {
            var capabilities = WaveInEvent.GetCapabilities(index);
            if (deviceId.Contains(capabilities.ProductName, StringComparison.OrdinalIgnoreCase) ||
                capabilities.ProductName.Contains(deviceId, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return 0;
    }

    private static MMDevice ResolveRenderDevice(MMDeviceEnumerator enumerator, string deviceId)
    {
        if (!string.IsNullOrWhiteSpace(deviceId))
        {
            foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            {
                if (string.Equals(device.ID, deviceId, StringComparison.Ordinal))
                {
                    return device;
                }
            }
        }

        return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    }
}
