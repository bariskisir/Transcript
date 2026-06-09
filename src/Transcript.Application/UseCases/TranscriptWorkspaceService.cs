using Microsoft.Extensions.Logging;
using Transcript.Application.Audio;
using Transcript.Application.Settings;
using Transcript.Application.Transcription;
using Transcript.Application.Transcripts;
using Transcript.Domain.Audio;
using Transcript.Domain.Settings;
using Transcript.Domain.Transcription;
using Transcript.Domain.Transcripts;

namespace Transcript.Application.UseCases;

/// <summary>
/// Default implementation of the primary workspace workflow.
/// </summary>
public sealed class TranscriptWorkspaceService : ITranscriptWorkspaceService
{
    private readonly ISettingsService settingsService;
    private readonly ITranscriptRepository transcriptRepository;
    private readonly IAudioDeviceService audioDeviceService;
    private readonly ILiveAudioCaptureService liveAudioCaptureService;
    private readonly ITranscriptionService transcriptionService;
    private readonly ITranscriptExportService exportService;
    private readonly ILogger<TranscriptWorkspaceService> logger;
    private readonly SemaphoreSlim gate = new(1, 1);

    private AppSettings settings = new();
    private IReadOnlyList<AudioDevice> devices = [];
    private List<TranscriptRecord> transcripts = [];
    private string activeTranscriptId = string.Empty;
    private string status = "Ready.";
    private string balance = string.Empty;
    private CancellationTokenSource? liveTranscriptionCts;
    private Task? liveTranscriptionTask;

    /// <summary>
    /// Initializes a new instance of the <see cref="TranscriptWorkspaceService" /> class.
    /// </summary>
    public TranscriptWorkspaceService(
        ISettingsService settingsService,
        ITranscriptRepository transcriptRepository,
        IAudioDeviceService audioDeviceService,
        ILiveAudioCaptureService liveAudioCaptureService,
        ITranscriptionService transcriptionService,
        ITranscriptExportService exportService,
        ILogger<TranscriptWorkspaceService> logger)
    {
        this.settingsService = settingsService;
        this.transcriptRepository = transcriptRepository;
        this.audioDeviceService = audioDeviceService;
        this.liveAudioCaptureService = liveAudioCaptureService;
        this.transcriptionService = transcriptionService;
        this.exportService = exportService;
        this.logger = logger;
    }

    /// <inheritdoc />
    public event EventHandler<WorkspaceChangedEventArgs>? StateChanged;

    /// <inheritdoc />
    public event EventHandler<InterimTranscriptEventArgs>? InterimTranscriptChanged;

    /// <inheritdoc />
    public async Task<AppViewState> InitializeAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            settings = await settingsService.LoadAsync(cancellationToken).ConfigureAwait(false);
            devices = await audioDeviceService.ListDevicesAsync(cancellationToken).ConfigureAwait(false);
            ApplyDefaultDevices();
            transcripts = (await transcriptRepository.LoadAllAsync(cancellationToken).ConfigureAwait(false))
                .OrderBy(item => item.CreatedAt)
                .ToList();

            if (transcripts.Count == 0)
            {
                var transcript = CreateNewTranscript();
                transcripts.Add(transcript);
                await transcriptRepository.SaveAsync(transcript, cancellationToken).ConfigureAwait(false);
            }

            activeTranscriptId = ResolveActiveTranscriptId();
            settings.ActiveTranscriptId = activeTranscriptId;
            await settingsService.SaveAsync(settings, cancellationToken).ConfigureAwait(false);
            status = "Ready.";
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> GetStateAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> SaveSettingsAsync(FrontendSettings input, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            settings.SpeakerDeviceId = input.SpeakerDeviceId;
            settings.MicrophoneDeviceId = input.MicrophoneDeviceId;
            settings.SpeakerEnabled = input.SpeakerEnabled;
            settings.MicrophoneEnabled = input.MicrophoneEnabled;
            settings.Language = LanguageCatalog.Normalize(input.Language);
            settings.AlwaysOnTop = input.AlwaysOnTop;
            settings.OutputDirectory = input.OutputDirectory;
            settings.Theme = input.Theme;
            settings.ActiveTranscriptId = activeTranscriptId;
            settings.Normalize();
            await settingsService.SaveAsync(settings, cancellationToken).ConfigureAwait(false);
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> TestAndSaveApiKeyAsync(string apiKey, CancellationToken cancellationToken = default)
    {
        var result = await transcriptionService.TestApiKeyAsync(apiKey, cancellationToken).ConfigureAwait(false);
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            status = result.Message;
            balance = result.BalanceLabel;
            if (result.Valid)
            {
                settings.ApiKey = apiKey.Trim();
                await settingsService.SaveAsync(settings, cancellationToken).ConfigureAwait(false);
            }

            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> CreateTranscriptAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (liveAudioCaptureService.IsRunning)
            {
                return BuildView();
            }

            var transcript = CreateNewTranscript();
            transcripts.Add(transcript);
            activeTranscriptId = transcript.Id;
            await transcriptRepository.SaveAsync(transcript, cancellationToken).ConfigureAwait(false);
            await SyncSettingsAsync(cancellationToken).ConfigureAwait(false);
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> DeleteActiveTranscriptAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (liveAudioCaptureService.IsRunning)
            {
                return BuildView();
            }

            var active = ActiveTranscript();
            if (active is null)
            {
                return BuildView();
            }

            if (transcripts.Count == 1 && active.IsEmpty())
            {
                status = "The last empty transcript cannot be deleted.";
                return BuildView();
            }

            await transcriptRepository.DeleteAsync(active.Id, cancellationToken).ConfigureAwait(false);
            transcripts.Remove(active);
            if (transcripts.Count == 0)
            {
                var replacement = CreateNewTranscript();
                transcripts.Add(replacement);
                await transcriptRepository.SaveAsync(replacement, cancellationToken).ConfigureAwait(false);
            }

            activeTranscriptId = transcripts[0].Id;
            await SyncSettingsAsync(cancellationToken).ConfigureAwait(false);
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> SelectTranscriptByOffsetAsync(int offset, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (liveAudioCaptureService.IsRunning)
            {
                return BuildView();
            }

            var index = ActiveTranscriptIndex();
            var next = index + offset;
            if (next >= 0 && next < transcripts.Count)
            {
                activeTranscriptId = transcripts[next].Id;
                await SyncSettingsAsync(cancellationToken).ConfigureAwait(false);
            }

            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> SaveActiveTranscriptTextAsync(string text, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var active = ActiveTranscript();
            if (active is not null)
            {
                active.ReplaceText(text);
                await transcriptRepository.SaveAsync(active, cancellationToken).ConfigureAwait(false);
                status = "Transcript saved.";
            }

            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> StartLiveTranscriptionAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (liveAudioCaptureService.IsRunning)
            {
                return BuildView();
            }

            if (string.IsNullOrWhiteSpace(settings.ApiKey))
            {
                status = "Enter and test a Deepgram API key first.";
                return BuildView();
            }

            if (!settings.SpeakerEnabled && !settings.MicrophoneEnabled)
            {
                status = "Turn Speaker or Mic on before starting.";
                return BuildView();
            }

            liveTranscriptionCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var selection = new AudioDeviceSelection(
                settings.SpeakerDeviceId,
                settings.MicrophoneDeviceId,
                settings.SpeakerEnabled,
                settings.MicrophoneEnabled);
            var frames = liveAudioCaptureService.StartAsync(selection, liveTranscriptionCts.Token);
            liveTranscriptionTask = Task.Run(() => ProcessLiveEventsAsync(frames, liveTranscriptionCts.Token), CancellationToken.None);
            status = CaptureStatus();
            return BuildView();
        }
        catch (Exception error)
        {
            logger.LogError(error, "Could not start live transcription.");
            status = error.Message;
            await liveAudioCaptureService.StopAsync(CancellationToken.None).ConfigureAwait(false);
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> StopLiveTranscriptionAsync(CancellationToken cancellationToken = default)
    {
        await StopLiveTranscriptionCoreAsync(cancellationToken).ConfigureAwait(false);
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            status = "Stopped.";
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> ImportAudioFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                status = "Select an existing audio file.";
                return BuildView();
            }
            finally
            {
                gate.Release();
            }
        }

        var segments = await transcriptionService
            .TranscribeFileAsync(settings.ApiKey, settings.Language, filePath, cancellationToken)
            .ConfigureAwait(false);

        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var active = ActiveTranscript();
            if (active is not null)
            {
                foreach (var segment in segments)
                {
                    active.AddSegment(segment.Source, segment.Text, segment.StartedAt, segment.EndedAt);
                }

                await transcriptRepository.SaveAsync(active, cancellationToken).ConfigureAwait(false);
                status = $"Imported {Path.GetFileName(filePath)}.";
            }

            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task<AppViewState> ExportActiveTranscriptAsync(ExportFormat format, string destinationPath, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var active = ActiveTranscript();
            if (active is null)
            {
                status = "No transcript is selected.";
                return BuildView();
            }

            await exportService.ExportAsync(active, format, destinationPath, cancellationToken).ConfigureAwait(false);
            status = $"Exported {Path.GetFileName(destinationPath)}.";
            return BuildView();
        }
        finally
        {
            gate.Release();
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await StopLiveTranscriptionCoreAsync(CancellationToken.None).ConfigureAwait(false);
        gate.Dispose();
    }

    private async Task ProcessLiveEventsAsync(IAsyncEnumerable<AudioFrame> frames, CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var item in transcriptionService.StreamLiveAsync(settings.ApiKey, settings.Language, frames, cancellationToken).ConfigureAwait(false))
            {
                switch (item.Kind)
                {
                    case TranscriptionEventKind.Status:
                        await SetStatusAsync(item.Message, cancellationToken).ConfigureAwait(false);
                        break;
                    case TranscriptionEventKind.Interim:
                        InterimTranscriptChanged?.Invoke(this, new InterimTranscriptEventArgs(item.Text));
                        break;
                    case TranscriptionEventKind.Final:
                        await AppendFinalSegmentAsync(item.Source, item.Text, item.StartedAt, item.EndedAt, cancellationToken).ConfigureAwait(false);
                        break;
                    case TranscriptionEventKind.Error:
                        await SetStatusAsync(item.Message, cancellationToken).ConfigureAwait(false);
                        break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal stop path.
        }
        catch (Exception error)
        {
            logger.LogError(error, "Live transcription failed.");
            await SetStatusAsync(error.Message, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private async Task AppendFinalSegmentAsync(string source, string text, TimeSpan? startedAt, TimeSpan? endedAt, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var active = ActiveTranscript();
            if (active is null)
            {
                return;
            }

            active.AddSegment(source, text, startedAt, endedAt);
            await transcriptRepository.SaveAsync(active, cancellationToken).ConfigureAwait(false);
            RaiseStateChanged(BuildView());
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task SetStatusAsync(string message, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            status = string.IsNullOrWhiteSpace(message) ? "Ready." : message;
            RaiseStateChanged(BuildView());
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task StopLiveTranscriptionCoreAsync(CancellationToken cancellationToken)
    {
        liveTranscriptionCts?.Cancel();
        await liveAudioCaptureService.StopAsync(cancellationToken).ConfigureAwait(false);
        if (liveTranscriptionTask is not null)
        {
            try
            {
                await liveTranscriptionTask.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
        }

        liveTranscriptionTask = null;
        liveTranscriptionCts?.Dispose();
        liveTranscriptionCts = null;
    }

    private TranscriptRecord CreateNewTranscript()
    {
        var now = DateTimeOffset.UtcNow;
        return new TranscriptRecord
        {
            Id = TranscriptId.NewId(),
            CreatedAt = now,
            UpdatedAt = now,
            Language = LanguageCatalog.Normalize(settings.Language),
            Title = $"Transcript {now.LocalDateTime:yyyy-MM-dd HH.mm}"
        };
    }

    private void ApplyDefaultDevices()
    {
        if (string.IsNullOrWhiteSpace(settings.SpeakerDeviceId))
        {
            settings.SpeakerDeviceId = DefaultDeviceId(AudioSourceKind.Speaker);
        }

        if (string.IsNullOrWhiteSpace(settings.MicrophoneDeviceId))
        {
            settings.MicrophoneDeviceId = DefaultDeviceId(AudioSourceKind.Microphone);
        }
    }

    private string DefaultDeviceId(AudioSourceKind kind)
    {
        return devices
            .Where(device => device.Kind == kind)
            .OrderByDescending(device => device.IsDefault)
            .Select(device => device.Id)
            .FirstOrDefault() ?? string.Empty;
    }

    private string ResolveActiveTranscriptId()
    {
        return transcripts.Any(item => item.Id == settings.ActiveTranscriptId)
            ? settings.ActiveTranscriptId
            : transcripts.First().Id;
    }

    private async Task SyncSettingsAsync(CancellationToken cancellationToken)
    {
        settings.ActiveTranscriptId = activeTranscriptId;
        await settingsService.SaveAsync(settings, cancellationToken).ConfigureAwait(false);
    }

    private TranscriptRecord? ActiveTranscript() => transcripts.FirstOrDefault(item => item.Id == activeTranscriptId);

    private int ActiveTranscriptIndex() => Math.Max(0, transcripts.FindIndex(item => item.Id == activeTranscriptId));

    private AppViewState BuildView()
    {
        var activeIndex = ActiveTranscriptIndex();
        var active = ActiveTranscript();
        return new AppViewState
        {
            Settings = settings,
            Status = status,
            Balance = balance,
            Transcripts = transcripts.Select(item => new TranscriptSummary(item.Id, item.ToListLabel(), item.Title)).ToList(),
            ActiveTranscriptId = activeTranscriptId,
            ActiveIndex = activeIndex,
            TranscriptCount = transcripts.Count,
            TranscriptText = active?.ToDisplayText() ?? string.Empty,
            Devices = devices,
            Languages = LanguageCatalog.GetSupportedLanguages(),
            Running = liveAudioCaptureService.IsRunning
        };
    }

    private string CaptureStatus()
    {
        return (settings.SpeakerEnabled, settings.MicrophoneEnabled) switch
        {
            (true, true) => "Listening to speaker and microphone.",
            (true, false) => "Listening to speaker.",
            (false, true) => "Listening to microphone.",
            _ => "Capture paused. Turn Speaker or Mic on to resume."
        };
    }

    private void RaiseStateChanged(AppViewState state)
    {
        StateChanged?.Invoke(this, new WorkspaceChangedEventArgs(state));
    }
}
