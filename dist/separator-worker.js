import * as cpuRuntime from './vendor/ort/ort.wasm.min.mjs';
import {separateGuitar} from './guitar-model.js';

const wasmPaths = new URL('./vendor/ort/', import.meta.url).href;
let runtime = cpuRuntime;
let session;
let fallbackModel;
let threads = 1;
let engine = 'wasm';

async function startSession(ort, buffer, providers, optimization) {
  ort.env.wasm.numThreads = threads;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = wasmPaths;
  const candidate = await ort.InferenceSession.create(buffer, {
    executionProviders: providers, graphOptimizationLevel: optimization
  });
  if (candidate.inputNames.join() !== 'mix' || candidate.outputNames.join() !== 'stems') {
    await candidate.release();
    throw Error('Use o modelo HTDemucs de seis fontes indicado no app.');
  }
  return candidate;
}

async function startCpu(buffer, compatibility = false) {
  runtime = cpuRuntime;
  engine = 'wasm';
  if (compatibility) {
    session = await startSession(runtime, buffer, ['wasm'], 'disabled');
    return;
  }
  try {
    session = await startSession(runtime, buffer, ['wasm'], 'basic');
  } catch {
    session = await startSession(runtime, buffer, ['wasm'], 'disabled');
  }
}

async function startEngine({buffer, modelBlob, preferGpu, compatibility}) {
  if (preferGpu && self.navigator?.gpu) {
    try {
      if (await self.navigator.gpu.requestAdapter()) {
        const gpuRuntime = await import('./vendor/ort/ort.webgpu.min.mjs');
        session = await startSession(gpuRuntime, buffer, ['webgpu', 'wasm'], 'basic');
        runtime = gpuRuntime;
        fallbackModel = modelBlob;
        engine = 'webgpu';
        return;
      }
    } catch {
      // Some browsers expose WebGPU but cannot initialize this model.
    }
  }
  await startCpu(buffer, compatibility);
}

function separate(data) {
  return separateGuitar(session, runtime, data.left, data.right, data.overlap,
    value => self.postMessage({type: 'progress', value}));
}

self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      await session?.release();
      fallbackModel = undefined;
      threads = data.threads || 1;
      await startEngine(data);
      self.postMessage({type: 'ready', threads, engine});
    } else if (data.type === 'separate') {
      if (!session) throw Error('Prepare a IA antes de processar.');
      let result;
      try {
        result = await separate(data);
      } catch (error) {
        if (engine !== 'webgpu' || !fallbackModel) throw error;
        self.postMessage({type: 'cpu-fallback', threads});
        try { await session.release(); } catch {}
        const model = fallbackModel;
        fallbackModel = undefined;
        await startCpu(await model.arrayBuffer());
        result = await separate(data);
      }
      const transfers = Object.values(result).flatMap(track => [track.left.buffer, track.right.buffer]);
      self.postMessage({type: 'result', result}, transfers);
    }
  } catch (error) {
    self.postMessage({type: 'error', message: error.message || String(error)});
  }
};
