using Microsoft.Extensions.Logging.Abstractions;
using Transcript.Infrastructure.Settings;

namespace Transcript.Tests.Infrastructure;

public sealed class JsonSettingsServiceTests
{
    [Fact]
    public async Task LoadAsync_CreatesDefaultSettings_WhenFileDoesNotExist()
    {
        using var paths = new TestAppPathProvider();
        var service = new JsonSettingsService(paths, NullLogger<JsonSettingsService>.Instance);

        var settings = await service.LoadAsync();

        Assert.Equal("en-US", settings.Language);
        Assert.True(File.Exists(paths.SettingsFile.FullName));
    }

    [Fact]
    public async Task LoadAsync_BacksUpInvalidSettings()
    {
        using var paths = new TestAppPathProvider();
        File.WriteAllText(paths.SettingsFile.FullName, "{ invalid json");
        var service = new JsonSettingsService(paths, NullLogger<JsonSettingsService>.Instance);

        var settings = await service.LoadAsync();

        Assert.Equal("en-US", settings.Language);
        Assert.NotEmpty(paths.DataDirectory.EnumerateFiles("settings.*.bak.json"));
    }
}
