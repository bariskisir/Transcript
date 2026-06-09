using Microsoft.Extensions.DependencyInjection;

namespace Transcript.Presentation;

/// <summary>
/// The MAUI application root.
/// </summary>
public partial class App : Microsoft.Maui.Controls.Application
{
    private readonly IServiceProvider serviceProvider;

    /// <summary>
    /// Initializes a new instance of the <see cref="App" /> class.
    /// </summary>
    /// <param name="serviceProvider">The service provider.</param>
    public App(IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
        InitializeComponent();
    }

    /// <inheritdoc />
    protected override Window CreateWindow(IActivationState? activationState)
    {
        var mainPage = serviceProvider.GetRequiredService<MainPage>();
        return new Window(mainPage)
        {
            Title = "Transcript"
        };
    }
}
