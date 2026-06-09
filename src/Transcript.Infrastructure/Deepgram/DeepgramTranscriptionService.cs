using System.Buffers;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using Transcript.Application.Audio;
using Transcript.Application.Transcription;
using Transcript.Domain.Transcription;
using Transcript.Domain.Transcripts;

namespace Transcript.Infrastructure.Deepgram;

/// <summary>
/// Deepgram-backed transcription service.
/// </summary>
public sealed class DeepgramTranscriptionService : ITranscriptionService
{
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(5);
    private static readonly byte[] KeepAlivePayload = Encoding.UTF8.GetBytes("""{"type":"KeepAlive"}""");
    private static readonly byte[] SilentPcmFrame = new byte[TranscriptionConstants.TargetSampleRate / 10 * 2];
    private readonly HttpClient httpClient;
    private readonly ILogger<DeepgramTranscriptionService> logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="DeepgramTranscriptionService" /> class.
    /// </summary>
    /// <param name="httpClient">The HTTP client.</param>
    /// <param name="logger">The logger.</param>
    public DeepgramTranscriptionService(HttpClient httpClient, ILogger<DeepgramTranscriptionService> logger)
    {
        this.httpClient = httpClient;
        this.logger = logger;
    }

    /// <inheritdoc />
    public async Task<DeepgramAccountStatus> TestApiKeyAsync(string apiKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new DeepgramAccountStatus(false, "Enter a Deepgram API key first.", string.Empty);
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.deepgram.com/v1/auth/token");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey.Trim());
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return new DeepgramAccountStatus(false, $"Deepgram rejected the API key ({(int)response.StatusCode}).", string.Empty);
        }

        var balance = await FetchBalanceLabelAsync(apiKey, cancellationToken).ConfigureAwait(false) ?? string.Empty;
        var message = string.IsNullOrWhiteSpace(balance)
            ? "Deepgram API key verified and saved."
            : $"Deepgram API key verified. {balance}";
        return new DeepgramAccountStatus(true, message, balance);
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<TranscriptionEvent> StreamLiveAsync(
        string apiKey,
        string language,
        IAsyncEnumerable<AudioFrame> frames,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            yield return TranscriptionEvent.Error("Deepgram API key is required.");
            yield break;
        }

        using var streamCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var events = Channel.CreateUnbounded<TranscriptionEvent>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });
        var workerTask = RunSourceWorkersAsync(apiKey, language, frames, events.Writer, streamCts.Token);

        try
        {
            await foreach (var item in events.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
            {
                yield return item;
            }
        }
        finally
        {
            streamCts.Cancel();
            await WaitForLoopsAsync(workerTask).ConfigureAwait(false);
        }
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<TranscriptSegment>> TranscribeFileAsync(string apiKey, string language, string filePath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Deepgram API key is required.");
        }

        await using var stream = File.OpenRead(filePath);
        using var content = new StreamContent(stream);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildPrerecordedUrl(language))
        {
            Content = content
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey.Trim());
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var text = DeepgramMessageParser.ParsePrerecordedTranscript(responseText);
        return string.IsNullOrWhiteSpace(text)
            ? []
            : [new TranscriptSegment(1, "Imported Audio", text, DateTimeOffset.UtcNow, TimeSpan.Zero, null)];
    }

    private async Task<string?> FetchBalanceLabelAsync(string apiKey, CancellationToken cancellationToken)
    {
        try
        {
            using var projectsRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.deepgram.com/v1/projects");
            projectsRequest.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey.Trim());
            using var projectsResponse = await httpClient.SendAsync(projectsRequest, cancellationToken).ConfigureAwait(false);
            if (!projectsResponse.IsSuccessStatusCode)
            {
                return string.Empty;
            }

            using var projectsJson = JsonDocument.Parse(await projectsResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            var projects = projectsJson.RootElement.GetProperty("projects");
            if (projects.GetArrayLength() == 0)
            {
                return string.Empty;
            }

            var projectId = projects[0].GetProperty("project_id").GetString();
            if (string.IsNullOrWhiteSpace(projectId))
            {
                return string.Empty;
            }

            using var balanceRequest = new HttpRequestMessage(HttpMethod.Get, $"https://api.deepgram.com/v1/projects/{projectId}/balances");
            balanceRequest.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey.Trim());
            using var balanceResponse = await httpClient.SendAsync(balanceRequest, cancellationToken).ConfigureAwait(false);
            if (!balanceResponse.IsSuccessStatusCode)
            {
                return string.Empty;
            }

            using var balanceJson = JsonDocument.Parse(await balanceResponse.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            return FormatBalances(balanceJson.RootElement);
        }
        catch (Exception error) when (error is JsonException or HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(error, "Deepgram balance lookup failed.");
            return string.Empty;
        }
    }

    private static string FormatBalances(JsonElement root)
    {
        if (!root.TryGetProperty("balances", out var balances) || balances.ValueKind != JsonValueKind.Array || balances.GetArrayLength() == 0)
        {
            return string.Empty;
        }

        var totals = new SortedDictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in balances.EnumerateArray())
        {
            var amount = item.TryGetProperty("amount", out var amountElement) && amountElement.TryGetDecimal(out var value) ? value : 0m;
            var units = item.TryGetProperty("units", out var unitsElement) ? unitsElement.GetString() : null;
            units = string.IsNullOrWhiteSpace(units) && item.TryGetProperty("currency", out var currency) ? currency.GetString() : units;
            units = string.IsNullOrWhiteSpace(units) ? "UNITS" : units.Trim().ToUpperInvariant();
            totals[units] = totals.GetValueOrDefault(units) + amount;
        }

        return "Deepgram: " + string.Join(", ", totals.Select(item => item.Key == "USD" ? $"${item.Value:0.00}" : $"{item.Value:0.##} {item.Key}"));
    }

    private static string BuildListenUrl(string language)
    {
        var normalized = LanguageCatalog.Normalize(language);
        var query = new Dictionary<string, string>
        {
            ["model"] = LanguageCatalog.GetModel(normalized),
            ["language"] = normalized,
            ["encoding"] = "linear16",
            ["sample_rate"] = TranscriptionConstants.TargetSampleRate.ToString(),
            ["channels"] = "1",
            ["smart_format"] = "true",
            ["interim_results"] = "true",
            ["vad_events"] = "true",
            ["punctuate"] = "true",
            ["utterance_end_ms"] = "1000"
        };
        return $"wss://api.deepgram.com/v1/listen?{Query(query)}";
    }

    private static string BuildPrerecordedUrl(string language)
    {
        var normalized = LanguageCatalog.Normalize(language);
        var query = new Dictionary<string, string>
        {
            ["model"] = LanguageCatalog.GetModel(normalized),
            ["language"] = normalized,
            ["smart_format"] = "true",
            ["punctuate"] = "true"
        };
        return $"https://api.deepgram.com/v1/listen?{Query(query)}";
    }

    private static string Query(IReadOnlyDictionary<string, string> values)
    {
        return string.Join("&", values.Select(item => $"{Uri.EscapeDataString(item.Key)}={Uri.EscapeDataString(item.Value)}"));
    }

    private static bool IsNormalCloseHandshakeError(WebSocketException error, CancellationToken cancellationToken)
    {
        return cancellationToken.IsCancellationRequested ||
            error.Message.Contains("closed the WebSocket connection without completing the close handshake", StringComparison.OrdinalIgnoreCase);
    }

    private async Task RunSourceWorkersAsync(
        string apiKey,
        string language,
        IAsyncEnumerable<AudioFrame> frames,
        ChannelWriter<TranscriptionEvent> events,
        CancellationToken cancellationToken)
    {
        var sourceChannels = new Dictionary<string, Channel<AudioFrame>>(StringComparer.OrdinalIgnoreCase);
        var sourceTasks = new List<Task>();

        try
        {
            await foreach (var frame in frames.WithCancellation(cancellationToken).ConfigureAwait(false))
            {
                var key = $"{frame.SourceKind}:{frame.SourceLabel}";
                if (!sourceChannels.TryGetValue(key, out var sourceChannel))
                {
                    sourceChannel = Channel.CreateBounded<AudioFrame>(new BoundedChannelOptions(128)
                    {
                        FullMode = BoundedChannelFullMode.DropOldest,
                        SingleReader = true,
                        SingleWriter = false
                    });
                    sourceChannels[key] = sourceChannel;
                    sourceTasks.Add(SourceSocketWorkerAsync(
                        apiKey,
                        language,
                        frame.SourceLabel,
                        sourceChannel.Reader,
                        events,
                        cancellationToken));
                }

                await sourceChannel.Writer.WriteAsync(frame, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            logger.LogError(error, "Audio source dispatch failed.");
            await events.WriteAsync(TranscriptionEvent.Error(error.Message), CancellationToken.None).ConfigureAwait(false);
        }
        finally
        {
            foreach (var sourceChannel in sourceChannels.Values)
            {
                sourceChannel.Writer.TryComplete();
            }

            await WaitForLoopsAsync(sourceTasks.ToArray()).ConfigureAwait(false);
            events.TryComplete();
        }
    }

    private async Task SourceSocketWorkerAsync(
        string apiKey,
        string language,
        string source,
        ChannelReader<AudioFrame> frames,
        ChannelWriter<TranscriptionEvent> events,
        CancellationToken cancellationToken)
    {
        using var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Authorization", $"Token {apiKey.Trim()}");
        var receiveBuffer = ArrayPool<byte>.Shared.Rent(32 * 1024);

        try
        {
            await socket.ConnectAsync(new Uri(BuildListenUrl(language)), cancellationToken).ConfigureAwait(false);
            await events.WriteAsync(TranscriptionEvent.Status($"Deepgram connected: {source}."), cancellationToken).ConfigureAwait(false);
            var receiveTask = ReceiveLoopAsync(socket, receiveBuffer, events, () => source, cancellationToken);
            var sendTask = SendLoopAsync(socket, frames, cancellationToken);
            await WaitForLoopsAsync(receiveTask, sendTask).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            logger.LogError(error, "Deepgram source worker failed for {Source}.", source);
            await events.WriteAsync(TranscriptionEvent.Error($"{source}: {error.Message}"), CancellationToken.None).ConfigureAwait(false);
        }
        finally
        {
            await CloseSocketAsync(socket, cancellationToken).ConfigureAwait(false);
            ArrayPool<byte>.Shared.Return(receiveBuffer);
        }
    }

    private async Task SendLoopAsync(
        ClientWebSocket socket,
        ChannelReader<AudioFrame> frames,
        CancellationToken cancellationToken)
    {
        try
        {
            using var keepAliveTimer = new PeriodicTimer(KeepAliveInterval);
            var waitForAudioTask = frames.WaitToReadAsync(cancellationToken).AsTask();
            var keepAliveTask = keepAliveTimer.WaitForNextTickAsync(cancellationToken).AsTask();

            while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var completed = await Task.WhenAny(waitForAudioTask, keepAliveTask).ConfigureAwait(false);
                if (completed == waitForAudioTask)
                {
                    if (!await waitForAudioTask.ConfigureAwait(false))
                    {
                        break;
                    }

                    while (frames.TryRead(out var frame))
                    {
                        if (frame.Pcm16Mono16Khz.Length > 0)
                        {
                            await socket.SendAsync(frame.Pcm16Mono16Khz, WebSocketMessageType.Binary, true, cancellationToken).ConfigureAwait(false);
                        }
                    }

                    waitForAudioTask = frames.WaitToReadAsync(cancellationToken).AsTask();
                    continue;
                }

                if (!await keepAliveTask.ConfigureAwait(false))
                {
                    break;
                }

                await SendKeepAliveAsync(socket, cancellationToken).ConfigureAwait(false);
                keepAliveTask = keepAliveTimer.WaitForNextTickAsync(cancellationToken).AsTask();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (WebSocketException error) when (IsNormalCloseHandshakeError(error, cancellationToken))
        {
            logger.LogInformation(error, "Deepgram WebSocket closed while sending audio.");
        }
        catch (Exception error)
        {
            logger.LogError(error, "Deepgram audio send loop failed.");
            throw;
        }
        finally
        {
            await CloseSocketAsync(socket, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task SendKeepAliveAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        if (socket.State != WebSocketState.Open)
        {
            return;
        }

        await socket.SendAsync(SilentPcmFrame, WebSocketMessageType.Binary, true, cancellationToken).ConfigureAwait(false);
        await socket.SendAsync(KeepAlivePayload, WebSocketMessageType.Text, true, cancellationToken).ConfigureAwait(false);
    }

    private async Task ReceiveLoopAsync(
        ClientWebSocket socket,
        byte[] buffer,
        ChannelWriter<TranscriptionEvent> writer,
        Func<string> sourceProvider,
        CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var message = await ReadSocketAsync(socket, buffer, cancellationToken).ConfigureAwait(false);
                if (message is null)
                {
                    break;
                }

                logger.LogDebug("Deepgram message: {Message}", message);
                var parsed = DeepgramMessageParser.ParseRealtimeMessage(message, sourceProvider());
                if (parsed is not null)
                {
                    await writer.WriteAsync(parsed, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (WebSocketException error) when (IsNormalCloseHandshakeError(error, cancellationToken))
        {
            logger.LogInformation(error, "Deepgram WebSocket closed while receiving transcription.");
        }
        catch (Exception error)
        {
            logger.LogError(error, "Deepgram receive loop failed.");
            await writer.WriteAsync(TranscriptionEvent.Error(error.Message), CancellationToken.None).ConfigureAwait(false);
        }
    }

    private async Task CloseSocketAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        if (socket.State is not (WebSocketState.Open or WebSocketState.CloseReceived))
        {
            return;
        }

        var closePayload = Encoding.UTF8.GetBytes("""{"type":"CloseStream"}""");
        try
        {
            await socket.SendAsync(closePayload, WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Transcript stopped.", CancellationToken.None).ConfigureAwait(false);
        }
        catch (WebSocketException error) when (IsNormalCloseHandshakeError(error, cancellationToken))
        {
            logger.LogInformation(error, "Deepgram WebSocket close handshake was already closed.");
        }
    }

    private async Task WaitForLoopsAsync(params Task[] tasks)
    {
        try
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "A Deepgram worker stopped with an error.");
        }
    }

    private static async Task<string?> ReadSocketAsync(ClientWebSocket socket, byte[] buffer, CancellationToken cancellationToken)
    {
        if (socket.State != WebSocketState.Open)
        {
            return null;
        }

        using var memory = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return null;
            }

            memory.Write(buffer, 0, result.Count);
        }
        while (!result.EndOfMessage);

        return Encoding.UTF8.GetString(memory.ToArray());
    }
}
