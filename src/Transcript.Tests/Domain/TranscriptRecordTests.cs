using Transcript.Domain.Transcripts;

namespace Transcript.Tests.Domain;

public sealed class TranscriptRecordTests
{
    [Fact]
    public void AddSegment_IgnoresBlankText()
    {
        var transcript = new TranscriptRecord();

        transcript.AddSegment("Mic", "   ");

        Assert.Empty(transcript.Segments);
    }

    [Fact]
    public void ReplaceText_StoresEditedTextAsSingleSegment()
    {
        var transcript = new TranscriptRecord();
        transcript.AddSegment("Mic", "hello");

        transcript.ReplaceText("edited text");

        Assert.Single(transcript.Segments);
        Assert.Equal("edited text", transcript.ToDisplayText());
        Assert.Equal("Edited", transcript.Segments[0].Source);
    }
}
