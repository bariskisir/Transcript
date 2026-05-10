//! Audio device discovery and microphone capture.

use crate::domain::{AudioDevice, AudioSourceKind};
use anyhow::{Context, Result, anyhow};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Host, SampleFormat, Stream, StreamConfig};
use tokio::sync::mpsc::Sender;

/// Keeps an active audio stream alive by holding ownership of the stream.
pub struct AudioStreamHandle {
    _stream: Stream,
}

impl AudioStreamHandle {
    /// Creates a new handle that keeps the given stream alive.
    fn new(stream: Stream) -> Self {
        Self { _stream: stream }
    }
}

/// Lists speaker and microphone devices.
pub fn list_devices() -> Vec<AudioDevice> {
    let host = audio_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.name().ok());
    let mut devices = Vec::new();

    if let Ok(inputs) = host.input_devices() {
        for device in inputs {
            let name = device
                .name()
                .unwrap_or_else(|_| AudioSourceKind::Microphone.label().to_owned());
            devices.push(AudioDevice {
                id: name.clone(),
                is_default: default_input.as_deref() == Some(name.as_str()),
                name,
                kind: AudioSourceKind::Microphone,
                is_available: true,
            });
        }
    }

    if let Ok(outputs) = host.output_devices() {
        for device in outputs {
            let name = device
                .name()
                .unwrap_or_else(|_| AudioSourceKind::Speaker.label().to_owned());
            devices.push(AudioDevice {
                id: name.clone(),
                is_default: default_output.as_deref() == Some(name.as_str()),
                name,
                kind: AudioSourceKind::Speaker,
                is_available: cfg!(target_os = "windows"),
            });
        }
    }

    devices
}

/// Starts microphone capture and forwards 16 kHz PCM chunks.
pub fn start_microphone(device_id: &str, sender: Sender<Vec<u8>>) -> Result<AudioStreamHandle> {
    let host = audio_host();
    let device = host
        .input_devices()?
        .find(|device| device.name().ok().as_deref() == Some(device_id))
        .or_else(|| host.default_input_device())
        .context("No microphone device is available")?;
    let supported = device.default_input_config()?;
    let config: StreamConfig = supported.clone().into();
    build_capture_stream(
        &device,
        config,
        supported.sample_format(),
        sender,
        "Audio stream error",
    )
}

/// Starts speaker loopback capture and forwards 16 kHz PCM chunks.
pub fn start_speaker_loopback(
    device_id: &str,
    sender: Sender<Vec<u8>>,
) -> Result<AudioStreamHandle> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!(
            "Speaker loopback is currently available on Windows only"
        ));
    }
    let host = audio_host();
    let device = host
        .output_devices()?
        .find(|device| device.name().ok().as_deref() == Some(device_id))
        .or_else(|| host.default_output_device())
        .context("No speaker device is available")?;
    let supported = device.default_output_config()?;
    let config: StreamConfig = supported.clone().into();
    build_capture_stream(
        &device,
        config,
        supported.sample_format(),
        sender,
        "Speaker loopback error",
    )
}

/// Builds and starts an input capture stream for any sample format.
fn build_capture_stream(
    device: &cpal::Device,
    config: StreamConfig,
    sample_format: SampleFormat,
    sender: Sender<Vec<u8>>,
    error_label: &'static str,
) -> Result<AudioStreamHandle> {
    let channels = config.channels.max(1) as usize;
    let source_rate = config.sample_rate.0;

    let stream = match sample_format {
        SampleFormat::F32 => {
            let sender = sender.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| send_pcm(data, channels, source_rate, &sender),
                move |error| log::error!("{error_label}: {error}"),
                None,
            )?
        }
        SampleFormat::I16 => {
            let sender = sender.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    let floats: Vec<f32> =
                        data.iter().map(|sample| *sample as f32 / 32768.0).collect();
                    send_pcm(&floats, channels, source_rate, &sender);
                },
                move |error| log::error!("{error_label}: {error}"),
                None,
            )?
        }
        SampleFormat::U16 => {
            let sender = sender.clone();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    let floats: Vec<f32> = data
                        .iter()
                        .map(|sample| (*sample as f32 - 32768.0) / 32768.0)
                        .collect();
                    send_pcm(&floats, channels, source_rate, &sender);
                },
                move |error| log::error!("{error_label}: {error}"),
                None,
            )?
        }
        _ => {
            return Err(anyhow!(
                "Unsupported audio sample format: {sample_format:?}"
            ));
        }
    };
    stream.play()?;
    Ok(AudioStreamHandle::new(stream))
}

/// Converts captured samples to mono 16 kHz PCM and sends them.
fn send_pcm(samples: &[f32], channels: usize, source_rate: u32, sender: &Sender<Vec<u8>>) {
    let mono = to_mono(samples, channels);
    let resampled = resample_nearest(&mono, source_rate, 16_000);
    let pcm = encode_pcm16(&resampled);
    let _ = sender.try_send(pcm);
}

/// Converts interleaved samples to mono.
fn to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
        .collect()
}

/// Resamples samples with a simple nearest-neighbor strategy.
fn resample_nearest(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if samples.is_empty() || source_rate == target_rate {
        return samples.to_vec();
    }
    let target_len = ((samples.len() as f64) * target_rate as f64 / source_rate as f64)
        .round()
        .max(1.0) as usize;
    (0..target_len)
        .map(|index| {
            let source_index =
                ((index as f64) * source_rate as f64 / target_rate as f64).round() as usize;
            samples[source_index.min(samples.len() - 1)]
        })
        .collect()
}

/// Encodes float samples as little-endian PCM16.
fn encode_pcm16(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let value = if clamped < 0.0 {
            clamped * 32768.0
        } else {
            clamped * 32767.0
        } as i16;
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

/// Returns the best CPAL host for desktop capture.
fn audio_host() -> Host {
    #[cfg(target_os = "windows")]
    {
        if let Ok(host) = cpal::host_from_id(cpal::HostId::Wasapi) {
            return host;
        }
    }
    cpal::default_host()
}
