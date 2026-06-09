using System.Text.Json;
using Transcript.Application.Transcription;

namespace Transcript.Infrastructure.Deepgram;

/// <summary>
/// Parses Deepgram realtime and prerecorded JSON payloads.
/// </summary>
public static class DeepgramMessageParser
{
    /// <summary>
    /// Parses a realtime WebSocket message.
    /// </summary>
    /// <param name="json">The JSON payload.</param>
    /// <param name="source">The source label to attach to transcript text.</param>
    /// <returns>A transcription event when text or status is present; otherwise <see langword="null" />.</returns>
    public static TranscriptionEvent? ParseRealtimeMessage(string json, string source)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in root.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var parsed = ParseRealtimeObject(item, source);
                if (parsed is not null)
                {
                    return parsed;
                }
            }

            return null;
        }

        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return ParseRealtimeObject(root, source);
    }

    /// <summary>
    /// Extracts the best transcript text from a prerecorded response.
    /// </summary>
    /// <param name="json">The JSON payload.</param>
    /// <returns>The extracted transcript text.</returns>
    public static string ParsePrerecordedTranscript(string json)
    {
        using var document = JsonDocument.Parse(json);
        return ExtractTranscript(document.RootElement);
    }

    private static TranscriptionEvent? ParseRealtimeObject(JsonElement root, string source)
    {
        var text = ExtractTranscript(root);
        if (string.IsNullOrWhiteSpace(text))
        {
            return root.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                ? TranscriptionEvent.Status(message.GetString() ?? string.Empty)
                : null;
        }

        var isFinal = Bool(root, "is_final") || Bool(root, "speech_final");
        var start = TryGetTime(root, "start");
        var duration = TryGetTime(root, "duration");
        TimeSpan? end = start.HasValue && duration.HasValue ? start.Value.Add(duration.Value) : null;
        return isFinal
            ? TranscriptionEvent.Final(source, text, start, end)
            : TranscriptionEvent.Interim(source, text);
    }

    private static string ExtractTranscript(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in root.EnumerateArray())
            {
                var text = ExtractTranscript(item);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }

            return string.Empty;
        }

        if (root.ValueKind != JsonValueKind.Object)
        {
            return string.Empty;
        }

        if (root.TryGetProperty("channel", out var channel) &&
            channel.ValueKind == JsonValueKind.Object &&
            channel.TryGetProperty("alternatives", out var alternatives) &&
            alternatives.ValueKind == JsonValueKind.Array &&
            alternatives.GetArrayLength() > 0 &&
            alternatives[0].ValueKind == JsonValueKind.Object &&
            alternatives[0].TryGetProperty("transcript", out var transcript) &&
            transcript.ValueKind == JsonValueKind.String)
        {
            return transcript.GetString()?.Trim() ?? string.Empty;
        }

        if (root.TryGetProperty("results", out var results) &&
            results.TryGetProperty("channels", out var channels) &&
            channels.ValueKind == JsonValueKind.Array &&
            channels.GetArrayLength() > 0)
        {
            var firstChannel = channels[0];
            if (firstChannel.TryGetProperty("alternatives", out var resultAlternatives) &&
                resultAlternatives.ValueKind == JsonValueKind.Array &&
                resultAlternatives.GetArrayLength() > 0 &&
                resultAlternatives[0].ValueKind == JsonValueKind.Object &&
                resultAlternatives[0].TryGetProperty("transcript", out var resultTranscript) &&
                resultTranscript.ValueKind == JsonValueKind.String)
            {
                return resultTranscript.GetString()?.Trim() ?? string.Empty;
            }

            return ExtractTranscript(firstChannel);
        }

        return string.Empty;
    }

    private static bool Bool(JsonElement root, string name)
    {
        return root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty(name, out var value) &&
            value.ValueKind == JsonValueKind.True;
    }

    private static TimeSpan? TryGetTime(JsonElement root, string name)
    {
        return root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty(name, out var value) &&
            value.TryGetDouble(out var seconds)
            ? TimeSpan.FromSeconds(seconds)
            : null;
    }
}
