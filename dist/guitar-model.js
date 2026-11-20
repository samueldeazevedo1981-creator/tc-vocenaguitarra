import {stemSpectrum} from './stem-spectrum.js';
import {reconstructStems} from './stem-reconstruction.js';
import {overlapWeight} from './audio-utils.js';

const segmentSize = 343980;
const guitarIndex = 4;
const voiceIndex = 3;

export async function separateGuitar(session, ort, left, right, overlap, onProgress, guitarOnly = false) {
  const stemNames = guitarOnly ? ['guitar'] : ['guitar', 'vocals'];
  const result = Object.fromEntries(stemNames.map(key => [
    key, {left: new Float32Array(left.length), right: new Float32Array(left.length)}
  ]));
  const stride = Math.floor(segmentSize * (1 - overlap));
  const segments = Math.max(1, 1 + Math.ceil((left.length - segmentSize) / stride));
  const weights = new Float32Array(left.length);
  const spectrumInputs = session.inputNames?.length === 3;

  for (let segment = 0; segment < segments; segment++) {
    const start = segment * stride;
    const length = Math.min(segmentSize, left.length - start);
    const wave = new Float32Array(2 * segmentSize);
    wave.set(left.subarray(start, start + length));
    wave.set(right.subarray(start, start + length), segmentSize);
    const input = new ort.Tensor('float32', wave, [1, 2, segmentSize]);
    let outputs;
    const spectrumTensors = [];
    try {
      const feeds = {mix: input};
      if (spectrumInputs) {
        const [real, imag] = stemSpectrum(wave);
        spectrumTensors.push(new ort.Tensor('float32', real, [2, 2049, 340]));
        spectrumTensors.push(new ort.Tensor('float32', imag, [2, 2049, 340]));
        feeds['/real_stft/Conv_output_0'] = spectrumTensors[0];
        feeds['/real_stft/Conv_1_output_0'] = spectrumTensors[1];
      }
      outputs = await session.run(feeds);
      const stem = outputs.stems;
      if (stem && stem.dims.join(',') !== '1,6,2,343980') {
        throw Error('Modelo incompatível: use o HTDemucs de seis fontes indicado no app.');
      }

      const samples = stem ? stem.data : reconstructStems(outputs, guitarOnly);
      const guitarOffset = stem ? guitarIndex * 2 * segmentSize : 0;
      const voiceOffset = (stem ? voiceIndex : 1) * 2 * segmentSize;
      for (let i = 0; i < length; i++) {
        const weight = overlapWeight(i, length, segmentSize - stride, segment > 0, segment + 1 < segments);
        const target = start + i;
        weights[target] += weight;
        result.guitar.left[target] += samples[guitarOffset + i] * weight;
        result.guitar.right[target] += samples[guitarOffset + segmentSize + i] * weight;
        if (!guitarOnly) {
          result.vocals.left[target] += samples[voiceOffset + i] * weight;
          result.vocals.right[target] += samples[voiceOffset + segmentSize + i] * weight;
        }
      }
    } finally {
      input.dispose();
      for (const tensor of spectrumTensors) tensor.dispose();
      for (const tensor of Object.values(outputs || {})) tensor.dispose();
    }
    onProgress((segment + 1) / segments);
  }

  for (const track of Object.values(result)) {
    for (let i = 0; i < weights.length; i++) {
      track.left[i] /= weights[i];
      track.right[i] /= weights[i];
    }
  }
  return result;
}
