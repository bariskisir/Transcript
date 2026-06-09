using Transcript.Application.Transcription;
using Transcript.Infrastructure.Deepgram;

namespace Transcript.Tests.Infrastructure;

public sealed class DeepgramMessageParserTests
{
    [Fact]
    public void ParseRealtimeMessage_ReturnsFinalEvent_WhenPayloadIsFinal()
    {
        const string json = """
            {
              "is_final": true,
              "channel": {
                "alternatives": [
                  { "transcript": "hello world" }
                ]
              }
            }
            """;

        var result = DeepgramMessageParser.ParseRealtimeMessage(json, "Mic");

        Assert.NotNull(result);
        Assert.Equal(TranscriptionEventKind.Final, result.Kind);
        Assert.Equal("hello world", result.Text);
    }

    [Fact]
    public void ParsePrerecordedTranscript_ReadsResultsShape()
    {
        const string json = """
            {
              "results": {
                "channels": [
                  {
                    "alternatives": [
                      { "transcript": "file transcript" }
                    ]
                  }
                ]
              }
            }
            """;

        var result = DeepgramMessageParser.ParsePrerecordedTranscript(json);

        Assert.Equal("file transcript", result);
    }

    [Fact]
    public void ParseRealtimeMessage_ReadsFirstTranscriptFromArrayPayload()
    {
        const string json = """
            [
              {
                "is_final": true,
                "channel": {
                  "alternatives": [
                    { "transcript": "array transcript" }
                  ]
                }
              }
            ]
            """;

        var result = DeepgramMessageParser.ParseRealtimeMessage(json, "Speaker");

        Assert.NotNull(result);
        Assert.Equal(TranscriptionEventKind.Final, result.Kind);
        Assert.Equal("Speaker", result.Source);
        Assert.Equal("array transcript", result.Text);
    }
}
