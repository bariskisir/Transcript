using NAudio.Wave;
using Transcript.Domain.Transcription;

namespace Transcript.Infrastructure.Audio;

/// <summary>
/// Converts platform audio buffers to 16 kHz mono PCM16.
/// </summary>
internal static class PcmAudioConverter
{
    /// <summary>
    /// Converts a captured buffer to provider-ready PCM.
    /// </summary>
    /// <param name="buffer">The captured audio bytes.</param>
    /// <param name="bytesRecorded">The number of valid bytes.</param>
    /// <param name="format">The source wave format.</param>
    /// <returns>16 kHz mono PCM16 bytes.</returns>
    public static byte[] ToPcm16Mono16Khz(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        var samples = DecodeToFloat(buffer.AsSpan(0, bytesRecorded), format);
        var mono = ToMono(samples, format.Channels);
        var resampled = ResampleNearest(mono, format.SampleRate, TranscriptionConstants.TargetSampleRate);
        return EncodePcm16(resampled);
    }

    private static float[] DecodeToFloat(ReadOnlySpan<byte> buffer, WaveFormat format)
    {
        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
        {
            var count = buffer.Length / sizeof(float);
            var samples = new float[count];
            for (var i = 0; i < count; i++)
            {
                samples[i] = BitConverter.ToSingle(buffer.Slice(i * 4, 4));
            }

            return samples;
        }

        if (format.BitsPerSample == 16)
        {
            var count = buffer.Length / sizeof(short);
            var samples = new float[count];
            for (var i = 0; i < count; i++)
            {
                samples[i] = BitConverter.ToInt16(buffer.Slice(i * 2, 2)) / 32768f;
            }

            return samples;
        }

        if (format.BitsPerSample == 32)
        {
            var count = buffer.Length / sizeof(int);
            var samples = new float[count];
            for (var i = 0; i < count; i++)
            {
                samples[i] = BitConverter.ToInt32(buffer.Slice(i * 4, 4)) / 2147483648f;
            }

            return samples;
        }

        return [];
    }

    private static float[] ToMono(float[] samples, int channels)
    {
        if (channels <= 1)
        {
            return samples;
        }

        var frames = samples.Length / channels;
        var mono = new float[frames];
        for (var frame = 0; frame < frames; frame++)
        {
            var sum = 0f;
            for (var channel = 0; channel < channels; channel++)
            {
                sum += samples[(frame * channels) + channel];
            }

            mono[frame] = sum / channels;
        }

        return mono;
    }

    private static float[] ResampleNearest(float[] samples, int sourceRate, int targetRate)
    {
        if (samples.Length == 0 || sourceRate == targetRate)
        {
            return samples;
        }

        var targetLength = Math.Max(1, (int)Math.Round(samples.Length * (double)targetRate / sourceRate));
        var output = new float[targetLength];
        for (var index = 0; index < targetLength; index++)
        {
            var sourceIndex = Math.Min(samples.Length - 1, (int)Math.Round(index * (double)sourceRate / targetRate));
            output[index] = samples[sourceIndex];
        }

        return output;
    }

    private static byte[] EncodePcm16(float[] samples)
    {
        var bytes = new byte[samples.Length * 2];
        for (var i = 0; i < samples.Length; i++)
        {
            var clamped = Math.Clamp(samples[i], -1f, 1f);
            var value = (short)(clamped < 0 ? clamped * 32768 : clamped * 32767);
            BitConverter.GetBytes(value).CopyTo(bytes, i * 2);
        }

        return bytes;
    }
}
