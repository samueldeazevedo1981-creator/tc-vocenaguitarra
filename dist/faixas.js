import {processingWindows,separationPlan,appendSeparationBlock} from './audio-utils.js';

export async function separarFaixas(original, tracks, run, onProgress) {
  const plan=separationPlan('fast',1);
  const windows=processingWindows(original.left.length,plan.block,plan.overlap);
  for (const [index,window] of windows.entries()) {
    const left=original.left.slice(window.start,window.end);
    const right=original.right.slice(window.start,window.end);
    const stems=await run(left,right,plan.ratio);
    for(const key of Object.keys(tracks))appendSeparationBlock(tracks[key],stems[key],window,plan.overlap);
    onProgress((index+1)/windows.length);
  }
}

export function compactarFaixa(track) {
  const result={};
  for(const key of ['left','right']){
    const source=track[key];
    let peak=1;
    for(const value of source)peak=Math.max(peak,Math.abs(value));
    const scale=peak/32767;
    const samples=Int16Array.from(source,value=>Math.round(value/scale));
    result[key]={samples,scale};
  }
  return result;
}

export function montarFaixa(song,mode,original,output) {
  for(const key of ['left','right']){
    const guitar=song.guitar[key],voice=song.vocals[key],target=output[key];
    for(let i=0;i<target.length;i++){
      const lead=guitar.samples[i]*guitar.scale;
      if(mode==='guitar')target[i]=lead;
      else {
        const vocal=mode==='instrumental'?voice.samples[i]*voice.scale:0;
        target[i]=original[key][i]-lead-vocal;
      }
    }
  }
}
