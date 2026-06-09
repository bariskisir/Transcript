using Microsoft.UI.Xaml;

namespace Transcript.Presentation.WinUI;

/// <summary>
/// Windows entry point for the MAUI application.
/// </summary>
public partial class App : MauiWinUIApplication
{
    /// <summary>
    /// Initializes the Windows application object.
    /// </summary>
    public App()
    {
        EnsureWritableWebView2UserDataFolder();
        InitializeComponent();
    }

    /// <summary>
    /// Points WebView2 at a writable user data folder. The default location is next to the
    /// executable, which is read-only when the app is installed under Program Files, causing
    /// WebView2 to fail to initialize and the UI to render blank.
    /// </summary>
    private static void EnsureWritableWebView2UserDataFolder()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER")))
        {
            return;
        }

        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Transcript",
            "WebView2");
        Directory.CreateDirectory(folder);
        Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", folder);
    }

    /// <inheritdoc />
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
