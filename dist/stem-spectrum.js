import {fft, getHannWindow, reflectPad} from './vendor/demucs/src/fft.js';

const size = 4096;
const hop = 1024;
const bins = size / 2 + 1;
const frames = 340;
const segment = 343980;

export function stemSpectrum(wave) {
  const spectrumReal = new Float32Array(2 * bins * frames);
  const spectrumImag = new Float32Array(spectrumReal.length);
  const frame = new Float32Array(size);
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  const window = getHannWindow(size);
  for (let channel = 0; channel < 2; channel++) {
    const signal = reflectPad(reflectPad(wave.subarray(channel * segment, (channel + 1) * segment), 1536, 1620), 2048, 2048);
    for (let f = 0; f < frames; f++) {
      const start = f * hop;
      for (let i = 0; i < size; i++) frame[i] = signal[start + i] * window[i] / 64;
      fft(real, imag, frame, size);
      for (let k = 0; k < bins; k++) {
        const index = (channel * bins + k) * frames + f;
        spectrumReal[index] = real[k];
        spectrumImag[index] = imag[k];
      }
    }
  }
  return [spectrumReal, spectrumImag];
}
