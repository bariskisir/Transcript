namespace Transcript.Application.Transcription;

/// <summary>
/// Represents Deepgram key validation and account balance details.
/// </summary>
/// <param name="Valid">Whether the API key is valid.</param>
/// <param name="Message">The user-facing validation message.</param>
/// <param name="BalanceLabel">The account balance label when available.</param>
public sealed record DeepgramAccountStatus(bool Valid, string Message, string BalanceLabel);
