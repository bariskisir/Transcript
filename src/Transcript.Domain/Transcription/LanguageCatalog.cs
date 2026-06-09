namespace Transcript.Domain.Transcription;

/// <summary>
/// Provides supported Deepgram language metadata.
/// </summary>
public static class LanguageCatalog
{
    /// <summary>
    /// The default language used on first run.
    /// </summary>
    public const string DefaultLanguage = "en-US";

    private static readonly IReadOnlyList<LanguageOption> Supported =
    [
        new("en-US", "English", null),
        new("tr", "Turkish", null),
        new("multi", "Multilingual", null),
        new("ar", "Arabic", null),
        new("de", "German", null),
        new("es", "Spanish", null),
        new("fr", "French", null),
        new("it", "Italian", null),
        new("pt-BR", "Portuguese (Brazil)", null),
        new("ru", "Russian", null),
        new("zh", "Chinese (Mandarin)", null),
        new("ja", "Japanese", null),
        new("ko", "Korean", null),
        new("th", "Thai", "nova-2"),
        new("vi", "Vietnamese", null)
    ];

    /// <summary>
    /// Returns all supported language options.
    /// </summary>
    /// <returns>The supported language options.</returns>
    public static IReadOnlyList<LanguageOption> GetSupportedLanguages() => Supported;

    /// <summary>
    /// Returns a supported language code or the default language.
    /// </summary>
    /// <param name="value">The user-provided language code.</param>
    /// <returns>A normalized language code.</returns>
    public static string Normalize(string? value)
    {
        return Supported.Any(language => string.Equals(language.Value, value, StringComparison.Ordinal))
            ? value!
            : DefaultLanguage;
    }

    /// <summary>
    /// Returns the Deepgram model for the given language.
    /// </summary>
    /// <param name="language">The language code.</param>
    /// <returns>The model name to send to Deepgram.</returns>
    public static string GetModel(string language)
    {
        var normalized = Normalize(language);
        return Supported.First(item => item.Value == normalized).Model ?? "nova-3";
    }
}
