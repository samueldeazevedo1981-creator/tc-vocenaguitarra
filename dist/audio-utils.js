export const SAMPLE_RATE=44100;

export function processingWindows(total,block=24*SAMPLE_RATE,overlap=2*SAMPLE_RATE){if(!Number.isSafeInteger(total)||total<=0||block<=overlap||overlap<1)throw Error('Tamanho de processamento inválido.');const windows=[];for(let start=0;start<total;start+=block-overlap){const end=Math.min(total,start+block);windows.push({start,end,hasPrevious:start>0,hasNext:end<total});if(end===total)break}return windows}

export function overlapWeight(i,length,overlap,hasPrevious,hasNext){let w=1;if(hasPrevious&&i<overlap)w=Math.min(w,(i+1)/overlap);if(hasNext&&i>=length-overlap)w=Math.min(w,(length-i)/overlap);return w}

export function clock(n){n=Math.max(0,Number(n)||0);return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0')}

export function separationPlan(mode,segmentsPerBlock=3){const samples=343980,ratio=mode==='quality'?.25:.025,stride=Math.floor(samples*(1-ratio)),overlap=samples-stride;return {ratio,overlap,block:samples+(segmentsPerBlock-1)*stride}}

export function appendSeparationBlock(output, track, window, overlap) {
  const length = window.end - window.start;
  if (!track || track.left.length !== length || track.right.length !== length) {
    throw Error('A IA retornou um bloco incompleto.');
  }
  for (const channel of ['left', 'right']) {
    const samples = track[channel], destination = output[channel];
    for (let i = 0; i < length; i++) {
      const sample = samples[i];
      if (!Number.isFinite(sample)) throw Error('A IA retornou valores inválidos.');
      const index = window.start + i;
      if (window.hasPrevious && i < overlap) {
        destination[index] = (destination[index] * (overlap - i) + sample * (i + 1)) / (overlap + 1);
      } else {
        destination[index] = sample;
      }
    }
  }
}
