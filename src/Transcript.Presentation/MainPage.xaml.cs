using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Web;
using Microsoft.Extensions.Logging;
using Transcript.Application.Settings;
using Transcript.Application.Transcripts;
using Transcript.Application.UseCases;
using Transcript.Domain.Transcripts;

namespace Transcript.Presentation;

/// <summary>
/// WebView-backed main desktop workspace.
/// </summary>
public partial class MainPage : ContentPage
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly ITranscriptWorkspaceService workspaceService;
    private readonly ILogger<MainPage> logger;
    private bool initialized;

    /// <summary>
    /// Initializes a new instance of the <see cref="MainPage" /> class.
    /// </summary>
    /// <param name="workspaceService">The workspace service.</param>
    /// <param name="logger">The logger.</param>
    public MainPage(ITranscriptWorkspaceService workspaceService, ILogger<MainPage> logger)
    {
        this.workspaceService = workspaceService;
        this.logger = logger;
        InitializeComponent();
        Browser.Navigating += OnBrowserNavigating;
        workspaceService.StateChanged += OnWorkspaceStateChanged;
        workspaceService.InterimTranscriptChanged += OnInterimTranscriptChanged;
    }

    /// <inheritdoc />
    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (initialized)
        {
            return;
        }

        initialized = true;
        try
        {
            var html = await BuildHtmlAsync();
            Browser.Source = new HtmlWebViewSource
            {
                Html = html
            };
        }
        catch (Exception error)
        {
            logger.LogError(error, "Could not load the embedded web user interface.");
            Browser.Source = new HtmlWebViewSource
            {
                Html = BuildStartupErrorHtml(error)
            };
        }
    }

    private async Task<string> BuildHtmlAsync()
    {
        var index = await ReadPackageTextAsync("wwwroot/index.html").ConfigureAwait(false);
        var styles = await ReadPackageTextAsync("wwwroot/styles.css").ConfigureAwait(false);
        var script = await ReadPackageTextAsync("wwwroot/app.js").ConfigureAwait(false);
        return index
            .Replace("<link rel=\"stylesheet\" href=\"styles.css\">", $"<style>{styles}</style>", StringComparison.Ordinal)
            .Replace("<script src=\"app.js\"></script>", $"<script>{script}</script>", StringComparison.Ordinal);
    }

    private static async Task<string> ReadPackageTextAsync(string path)
    {
        var filePath = Path.Combine(AppContext.BaseDirectory, path.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(filePath))
        {
            return await File.ReadAllTextAsync(filePath).ConfigureAwait(false);
        }

        await using var stream = await FileSystem.OpenAppPackageFileAsync(path).ConfigureAwait(false);
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync().ConfigureAwait(false);
    }

    private static string BuildStartupErrorHtml(Exception error)
    {
        var message = HtmlEncoder.Default.Encode(error.Message);
        var baseDirectory = HtmlEncoder.Default.Encode(AppContext.BaseDirectory);
        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <title>Transcript</title>
              <style>
                body { margin: 0; min-height: 100vh; background: #101113; color: #f5f1e8; font-family: Arial, sans-serif; display: grid; place-items: center; }
                main { max-width: 520px; padding: 24px; }
                h1 { margin: 0 0 12px; font-size: 20px; }
                p { margin: 8px 0; line-height: 1.45; color: #cfc8b8; }
                code { color: #f7d38a; overflow-wrap: anywhere; }
              </style>
            </head>
            <body>
              <main>
                <h1>Transcript could not load the interface.</h1>
                <p>{{message}}</p>
                <p>Application folder: <code>{{baseDirectory}}</code></p>
              </main>
            </body>
            </html>
            """;
    }

    private void OnBrowserNavigating(object? sender, WebNavigatingEventArgs args)
    {
        if (!Uri.TryCreate(args.Url, UriKind.Absolute, out var uri) || uri.Scheme != "transcript")
        {
            return;
        }

        args.Cancel = true;
        _ = HandleBridgeRequestAsync(uri);
    }

    private async Task HandleBridgeRequestAsync(Uri uri)
    {
        var query = HttpUtility.ParseQueryString(uri.Query);
        var requestId = query["id"] ?? "0";
        var command = uri.Host.ToLowerInvariant();
        var payload = query["payload"] ?? "{}";

        try
        {
            var result = await ExecuteCommandAsync(command, payload).ConfigureAwait(false);
            await CompleteBridgeRequestAsync(requestId, true, result).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            logger.LogError(error, "Web command {Command} failed.", command);
            await CompleteBridgeRequestAsync(requestId, false, error.Message).ConfigureAwait(false);
        }
    }

    private async Task<object?> ExecuteCommandAsync(string command, string payload)
    {
        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(payload) ? "{}" : payload);
        var root = document.RootElement;
        return command switch
        {
            "ready" => await workspaceService.InitializeAsync().ConfigureAwait(false),
            "getappstate" => await workspaceService.GetStateAsync().ConfigureAwait(false),
            "savesettings" => await workspaceService.SaveSettingsAsync(ReadSettings(root)).ConfigureAwait(false),
            "testdeepgramkey" => await workspaceService.TestAndSaveApiKeyAsync(ReadString(root, "apiKey")).ConfigureAwait(false),
            "createtranscript" => await workspaceService.CreateTranscriptAsync().ConfigureAwait(false),
            "deletetranscript" => await workspaceService.DeleteActiveTranscriptAsync().ConfigureAwait(false),
            "selecttranscriptbyoffset" => await workspaceService.SelectTranscriptByOffsetAsync(ReadInt(root, "offset")).ConfigureAwait(false),
            "savetranscripttext" => await workspaceService.SaveActiveTranscriptTextAsync(ReadString(root, "text")).ConfigureAwait(false),
            "startcapture" => await workspaceService.StartLiveTranscriptionAsync().ConfigureAwait(false),
            "stopcapture" => await workspaceService.StopLiveTranscriptionAsync().ConfigureAwait(false),
            "copytext" => await CopyTextAsync(ReadString(root, "text")).ConfigureAwait(false),
            "importaudio" => await ImportAudioAsync().ConfigureAwait(false),
            "exporttranscript" => await ExportTranscriptAsync(ReadExportFormat(root)).ConfigureAwait(false),
            "openurl" => await OpenUrlAsync(ReadString(root, "url")).ConfigureAwait(false),
            _ => throw new InvalidOperationException($"Unknown command: {command}")
        };
    }

    private static FrontendSettings ReadSettings(JsonElement root)
    {
        return new FrontendSettings
        {
            SpeakerDeviceId = ReadString(root, "speakerDeviceId"),
            MicrophoneDeviceId = ReadString(root, "microphoneDeviceId"),
            Language = ReadString(root, "language", "en-US"),
            SpeakerEnabled = ReadBool(root, "speakerEnabled", true),
            MicrophoneEnabled = ReadBool(root, "microphoneEnabled", true),
            AlwaysOnTop = ReadBool(root, "alwaysOnTop"),
            OutputDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Theme = "System"
        };
    }

    private async Task<object?> CopyTextAsync(string text)
    {
        if (!string.IsNullOrWhiteSpace(text))
        {
            await Clipboard.Default.SetTextAsync(text).ConfigureAwait(false);
        }

        return new { copied = true };
    }

    private async Task<AppViewState> ImportAudioAsync()
    {
        var file = await FilePicker.Default.PickAsync(new PickOptions
        {
            PickerTitle = "Select an audio file"
        }).ConfigureAwait(false);
        return file is null
            ? await workspaceService.GetStateAsync().ConfigureAwait(false)
            : await workspaceService.ImportAudioFileAsync(file.FullPath).ConfigureAwait(false);
    }

    private async Task<AppViewState> ExportTranscriptAsync(ExportFormat format)
    {
        var extension = format switch
        {
            ExportFormat.Text => "txt",
            ExportFormat.Markdown => "md",
            ExportFormat.Json => "json",
            ExportFormat.Srt => "srt",
            _ => "txt"
        };
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        var destination = Path.Combine(documents, $"Transcript-{DateTimeOffset.Now:yyyyMMdd-HHmmss}.{extension}");
        return await workspaceService.ExportActiveTranscriptAsync(format, destination).ConfigureAwait(false);
    }

    private static async Task<object?> OpenUrlAsync(string url)
    {
        if (!string.IsNullOrWhiteSpace(url))
        {
            await Launcher.Default.OpenAsync(url).ConfigureAwait(false);
        }

        return new { opened = true };
    }

    private async Task CompleteBridgeRequestAsync(string requestId, bool ok, object? payload)
    {
        var payloadJson = JsonSerializer.Serialize(payload, JsonOptions);
        var script = $"window.transcriptBridge.complete({JsonSerializer.Serialize(requestId)}, {ok.ToString().ToLowerInvariant()}, {payloadJson});";
        await MainThread.InvokeOnMainThreadAsync(async () => await Browser.EvaluateJavaScriptAsync(script).ConfigureAwait(false)).ConfigureAwait(false);
    }

    private void OnWorkspaceStateChanged(object? sender, WorkspaceChangedEventArgs args)
    {
        _ = DispatchEventAsync(new { type = "state", state = args.State });
    }

    private void OnInterimTranscriptChanged(object? sender, InterimTranscriptEventArgs args)
    {
        _ = DispatchEventAsync(new { type = "interim", text = args.Text });
    }

    private async Task DispatchEventAsync(object payload)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var script = $"window.transcriptApp.receiveEvent({json});";
        await MainThread.InvokeOnMainThreadAsync(async () => await Browser.EvaluateJavaScriptAsync(script).ConfigureAwait(false)).ConfigureAwait(false);
    }

    private static string ReadString(JsonElement root, string name, string defaultValue = "")
    {
        return root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? defaultValue
            : defaultValue;
    }

    private static int ReadInt(JsonElement root, string name)
    {
        return root.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : 0;
    }

    private static bool ReadBool(JsonElement root, string name, bool defaultValue = false)
    {
        return root.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : defaultValue;
    }

    private static ExportFormat ReadExportFormat(JsonElement root)
    {
        var value = ReadString(root, "format", "markdown");
        return value.ToLowerInvariant() switch
        {
            "text" => ExportFormat.Text,
            "json" => ExportFormat.Json,
            "srt" => ExportFormat.Srt,
            _ => ExportFormat.Markdown
        };
    }
}
