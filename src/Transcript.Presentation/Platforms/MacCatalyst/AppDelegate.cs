using Foundation;

namespace Transcript.Presentation;

/// <summary>
/// Mac Catalyst application delegate.
/// </summary>
[Register("AppDelegate")]
public sealed class AppDelegate : MauiUIApplicationDelegate
{
    /// <inheritdoc />
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
