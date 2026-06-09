using Transcript.Domain.Transcription;

namespace Transcript.Tests.Domain;

public sealed class LanguageCatalogTests
{
    [Fact]
    public void Normalize_ReturnsDefault_WhenLanguageIsUnsupported()
    {
        Assert.Equal(LanguageCatalog.DefaultLanguage, LanguageCatalog.Normalize("invalid"));
    }

    [Fact]
    public void GetModel_ReturnsLanguageOverride_WhenConfigured()
    {
        Assert.Equal("nova-2", LanguageCatalog.GetModel("th"));
    }
}
