import {processingWindows,separationPlan,appendSeparationBlock} from './audio-utils.js';

export async function separarFaixas(original, guitar, run, onProgress) {
  const plan=separationPlan('fast',1);
  const windows=processingWindows(original.left.length,plan.block,plan.overlap);
  for (const [index,window] of windows.entries()) {
    const left=original.left.slice(window.start,window.end);
    const right=original.right.slice(window.start,window.end);
    const stem=await run(left,right,plan.ratio);
    appendSeparationBlock(guitar,stem,window,plan.overlap);
    onProgress((index+1)/windows.length);
  }
}

export function tirarGuitarra(original,guitar,backing) {
  for (const channel of ['left','right']) {
    const mix=original[channel], lead=guitar[channel], output=backing[channel];
    for (let i=0;i<mix.length;i++) output[i]=mix[i]-lead[i];
  }
}
