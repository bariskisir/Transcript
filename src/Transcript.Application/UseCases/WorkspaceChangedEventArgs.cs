using Transcript.Application.Transcripts;

namespace Transcript.Application.UseCases;

/// <summary>
/// Provides an updated workspace state.
/// </summary>
/// <param name="State">The updated view state.</param>
public sealed class WorkspaceChangedEventArgs(AppViewState State) : EventArgs
{
    /// <summary>
    /// Gets the updated view state.
    /// </summary>
    public AppViewState State { get; } = State;
}
