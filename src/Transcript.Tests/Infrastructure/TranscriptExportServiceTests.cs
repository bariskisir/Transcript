using Transcript.Domain.Transcripts;
using Transcript.Infrastructure.Exports;

namespace Transcript.Tests.Infrastructure;

public sealed class TranscriptExportServiceTests
{
    [Fact]
    public void RenderMarkdown_IncludesTitleAndSegments()
    {
        var transcript = new TranscriptRecord { Title = "Meeting", Language = "en-US" };
        transcript.AddSegment("Mic", "Hello world.");
        var service = new TranscriptExportService();

        var output = service.Render(transcript, ExportFormat.Markdown);

        Assert.Contains("# Meeting", output);
        Assert.Contains("**Mic:** Hello world.", output);
    }

    [Fact]
    public void RenderSrt_UsesSegmentTiming()
    {
        var transcript = new TranscriptRecord();
        transcript.AddSegment("Mic", "Hello.", TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3));
        var service = new TranscriptExportService();

        var output = service.Render(transcript, ExportFormat.Srt);

        Assert.Contains("00:00:01,000 --> 00:00:03,000", output);
        Assert.Contains("Hello.", output);
    }
}
