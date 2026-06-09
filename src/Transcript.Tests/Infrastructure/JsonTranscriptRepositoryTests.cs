using Microsoft.Extensions.Logging.Abstractions;
using Transcript.Domain.Transcripts;
using Transcript.Infrastructure.Persistence;

namespace Transcript.Tests.Infrastructure;

public sealed class JsonTranscriptRepositoryTests
{
    [Fact]
    public async Task SaveAndLoadAllAsync_RoundTripsTranscript()
    {
        using var paths = new TestAppPathProvider();
        var repository = new JsonTranscriptRepository(paths, NullLogger<JsonTranscriptRepository>.Instance);
        var transcript = new TranscriptRecord { Title = "Roundtrip" };
        transcript.AddSegment("Mic", "hello");

        await repository.SaveAsync(transcript);
        var loaded = await repository.LoadAllAsync();

        Assert.Single(loaded);
        Assert.Equal("hello", loaded[0].ToDisplayText());
    }
}
