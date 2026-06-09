using System.Text;
using System.Text.Json;
using Transcript.Application.Transcripts;
using Transcript.Domain.Transcripts;

namespace Transcript.Infrastructure.Exports;

/// <summary>
/// Exports transcript records into common desktop file formats.
/// </summary>
public sealed class TranscriptExportService : ITranscriptExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    /// <inheritdoc />
    public async Task ExportAsync(TranscriptRecord transcript, ExportFormat format, string destinationPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(destinationPath))
        {
            throw new ArgumentException("Destination path is required.", nameof(destinationPath));
        }

        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        await File.WriteAllTextAsync(destinationPath, Render(transcript, format), Encoding.UTF8, cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public string Render(TranscriptRecord transcript, ExportFormat format)
    {
        return format switch
        {
            ExportFormat.Text => RenderText(transcript),
            ExportFormat.Markdown => RenderMarkdown(transcript),
            ExportFormat.Json => JsonSerializer.Serialize(transcript, JsonOptions),
            ExportFormat.Srt => RenderSrt(transcript),
            _ => throw new ArgumentOutOfRangeException(nameof(format), format, "Unsupported export format.")
        };
    }

    private static string RenderText(TranscriptRecord transcript)
    {
        return transcript.ToDisplayText();
    }

    private static string RenderMarkdown(TranscriptRecord transcript)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"# {transcript.Title}");
        builder.AppendLine();
        builder.AppendLine($"Created: {transcript.CreatedAt.LocalDateTime:yyyy-MM-dd HH:mm}");
        builder.AppendLine($"Language: {transcript.Language}");
        builder.AppendLine();
        foreach (var segment in transcript.Segments)
        {
            builder.AppendLine($"**{segment.Source}:** {segment.Text}");
            builder.AppendLine();
        }

        return builder.ToString().TrimEnd();
    }

    private static string RenderSrt(TranscriptRecord transcript)
    {
        var builder = new StringBuilder();
        var fallbackStart = TimeSpan.Zero;
        for (var i = 0; i < transcript.Segments.Count; i++)
        {
            var segment = transcript.Segments[i];
            var start = segment.StartedAt ?? fallbackStart;
            var end = segment.EndedAt ?? start.Add(TimeSpan.FromSeconds(Math.Max(2, segment.Text.Length / 14)));
            builder.AppendLine((i + 1).ToString());
            builder.AppendLine($"{FormatSrtTime(start)} --> {FormatSrtTime(end)}");
            builder.AppendLine(segment.Text);
            builder.AppendLine();
            fallbackStart = end.Add(TimeSpan.FromMilliseconds(250));
        }

        return builder.ToString().TrimEnd();
    }

    private static string FormatSrtTime(TimeSpan value)
    {
        return $"{(int)value.TotalHours:00}:{value.Minutes:00}:{value.Seconds:00},{value.Milliseconds:000}";
    }
}
