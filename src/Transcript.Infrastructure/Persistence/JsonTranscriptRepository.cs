using System.Text.Json;
using Microsoft.Extensions.Logging;
using Transcript.Application.Abstractions;
using Transcript.Application.Transcripts;
using Transcript.Domain.Transcripts;

namespace Transcript.Infrastructure.Persistence;

/// <summary>
/// Stores transcripts as JSON files in AppData.
/// </summary>
public sealed class JsonTranscriptRepository : ITranscriptRepository
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly IAppPathProvider pathProvider;
    private readonly ILogger<JsonTranscriptRepository> logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="JsonTranscriptRepository" /> class.
    /// </summary>
    public JsonTranscriptRepository(IAppPathProvider pathProvider, ILogger<JsonTranscriptRepository> logger)
    {
        this.pathProvider = pathProvider;
        this.logger = logger;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<TranscriptRecord>> LoadAllAsync(CancellationToken cancellationToken = default)
    {
        var directory = pathProvider.TranscriptDirectory;
        var transcripts = new List<TranscriptRecord>();
        foreach (var file in directory.EnumerateFiles("*.json"))
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var transcript = await LoadFromFileAsync(file, cancellationToken).ConfigureAwait(false);
                if (transcript is not null)
                {
                    transcripts.Add(transcript);
                }
            }
            catch (Exception error) when (error is JsonException or IOException or UnauthorizedAccessException)
            {
                logger.LogError(error, "Could not load transcript file {TranscriptFile}.", file.FullName);
            }
        }

        return transcripts.OrderBy(item => item.CreatedAt).ToList();
    }

    /// <inheritdoc />
    public async Task<TranscriptRecord?> LoadAsync(string id, CancellationToken cancellationToken = default)
    {
        var file = TranscriptFile(id);
        return file.Exists ? await LoadFromFileAsync(file, cancellationToken).ConfigureAwait(false) : null;
    }

    /// <inheritdoc />
    public async Task SaveAsync(TranscriptRecord transcript, CancellationToken cancellationToken = default)
    {
        var file = TranscriptFile(transcript.Id);
        Directory.CreateDirectory(file.DirectoryName!);
        var tempPath = $"{file.FullName}.tmp";
        await using (var stream = File.Create(tempPath))
        {
            await JsonSerializer.SerializeAsync(stream, transcript, SerializerOptions, cancellationToken).ConfigureAwait(false);
        }

        File.Move(tempPath, file.FullName, overwrite: true);
    }

    /// <inheritdoc />
    public Task DeleteAsync(string id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var file = TranscriptFile(id);
        if (file.Exists)
        {
            file.Delete();
        }

        return Task.CompletedTask;
    }

    private FileInfo TranscriptFile(string id)
    {
        var safeId = string.Concat(id.Where(character => char.IsLetterOrDigit(character) || character is '-' or '_'));
        return new FileInfo(Path.Combine(pathProvider.TranscriptDirectory.FullName, $"{safeId}.json"));
    }

    private static async Task<TranscriptRecord?> LoadFromFileAsync(FileInfo file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenRead();
        return await JsonSerializer.DeserializeAsync<TranscriptRecord>(stream, SerializerOptions, cancellationToken).ConfigureAwait(false);
    }
}
