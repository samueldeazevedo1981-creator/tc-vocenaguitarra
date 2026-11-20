import {istft} from './vendor/demucs/src/fft.js';

const frames = 340;
const bins = 2049;
const fftSize = 4096;
const hop = 1024;
const trim = 3584;
const samples = 343980;

export function reconstructStems(outputs, guitarOnly = false) {
  const spectrum = outputs['/Pad_2_output_0'];
  const time = outputs['/Add_4_output_0'];
  if (spectrum?.dims.join() !== '1,6,2,2,2049,340' || time?.dims.join() !== '1,6,2,343980') {
    throw Error('Saída do modelo incompatível.');
  }
  const spec = spectrum.data;
  const waveform = time.data;
  const stems = guitarOnly ? [4] : [4, 3];
  const result = new Float32Array(stems.length * 2 * samples);
  const real = new Float32Array(frames * bins);
  const imag = new Float32Array(real.length);
  for (const [index, stem] of stems.entries()) {
    for (let channel = 0; channel < 2; channel++) {
      const base = (stem * 2 + channel) * 2 * real.length;
      for (let bin = 0; bin < bins; bin++) {
        const offset = base + bin * frames;
        for (let frame = 0; frame < frames; frame++) {
          real[frame * bins + bin] = spec[offset + frame];
          imag[frame * bins + bin] = spec[offset + frame + real.length];
        }
      }
      const audio = istft(real, imag, frames, bins, fftSize, hop);
      const source = (stem * 2 + channel) * samples;
      const target = (index * 2 + channel) * samples;
      for (let i = 0; i < samples; i++) result[target + i] = audio[trim + i] + waveform[source + i];
    }
  }
  return result;
}
