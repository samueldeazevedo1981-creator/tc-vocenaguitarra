import {clock,SAMPLE_RATE} from './audio-utils.js';
import {separarFaixas,tirarGuitarra} from './faixas.js';

const $=id=>document.getElementById(id);
const fileInput=$('file'), progress=$('progress'), status=$('status');
let context, selected, tracks, processingWorker, job, player, offset=0, startedAt=0, animation;

function client(path,options) {
  const worker=new Worker(new URL(path,import.meta.url),options);
  let pending;
  function fail(error) {
    pending?.reject(error);
    pending=null;
  }
  worker.onerror=()=>fail(Error('O navegador interrompeu o processamento.'));
  worker.onmessage=({data})=>{
    if(!pending||data.type==='progress')return;
    const {resolve,reject}=pending;
    pending=null;
    if(data.type==='error')reject(Error(data.message));
    else resolve(data);
  };
  return {
    send(message,transfer=[]) {
      return new Promise((resolve,reject)=>{
        pending={resolve,reject};
        try { worker.postMessage(message,transfer); } catch(error) { fail(error); }
      });
    },
    close() { worker.terminate();fail(Error('Operação cancelada.')); }
  };
}

function interfaceState(active) {
  fileInput.disabled=active;
  $('separate').disabled=active||!selected;
  $('cancel').hidden=!active;
  $('save').disabled=active;
  progress.hidden=!active;
}

function report(message,fraction) {
  status.textContent=message;
  if(Number.isFinite(fraction))progress.value=fraction;
  else progress.removeAttribute('value');
}

function channelData(buffer) {
  return {left:buffer.getChannelData(0),right:buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1))};
}

function stop(reset=false) {
  cancelAnimationFrame(animation);
  if(player) {
    offset=context.currentTime-startedAt;
    player.onended=null;
    player.stop();
    player.disconnect();
    player=null;
  }
  if(reset)offset=0;
  $('play').textContent='Ouvir';
  position();
}

function position() {
  $('seek').value=offset;
  $('position').textContent=clock(offset);
}

async function play() {
  if(player){stop();return;}
  await context.resume();
  const buffer=tracks?.[$('mode').value];
  if(!buffer||player)return;
  if(offset>=buffer.duration)offset=0;
  const node=context.createBufferSource();
  node.buffer=buffer;
  node.connect(context.destination);
  node.onended=()=>{
    if(player!==node)return;
    player=null;
    node.disconnect();
    stop(true);
  };
  player=node;
  startedAt=context.currentTime-offset;
  node.start(0,offset);
  $('play').textContent='Pausar';
  const tick=()=>{
    if(!player)return;
    $('seek').value=Math.min(buffer.duration,context.currentTime-startedAt);
    $('position').textContent=clock(Number($('seek').value));
    animation=requestAnimationFrame(tick);
  };
  tick();
}

function assertActive(current) {
  if(current.signal.aborted)throw Error('Operação cancelada.');
}

fileInput.onchange=()=>{
  stop(true);
  tracks=null;
  $('results').hidden=true;
  const file=fileInput.files[0];
  selected=file&&/\.mp3$/i.test(file.name)?file:null;
  if(!selected)fileInput.value='';
  interfaceState(false);
  report(selected?'MP3 selecionado. Clique em Separar guitarra.':'Escolha um arquivo MP3.');
};

async function loadWorker(current,threads) {
  const worker=client('./separator-worker.js',{type:'module'});
  current.worker=worker;
  const response=await fetch('./models/guitarra-int8.onnx',{signal:current.signal});
  if(!response.ok)throw Error('Não foi possível baixar o modelo de guitarra.');
  const model=await response.arrayBuffer();
  assertActive(current);
  await worker.send({type:'load',buffer:model,threads,optimize:true},[model]);
  return worker;
}

$('separate').onclick=async()=>{
  if(!selected||job)return;
  const current=new AbortController();
  job=current;
  interfaceState(true);
  stop(true);
  $('results').hidden=true;
  tracks=null;
  try {
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    context??=new AudioContext();
    await context.resume();
    report('Preparando o motor de guitarra…');
    const cores=navigator.hardwareConcurrency||2;
    const phone=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const threads=globalThis.crossOriginIsolated?Math.max(1,Math.min(phone?2:8,Math.floor(cores/2))):1;
    if(!processingWorker){
      try { processingWorker=await loadWorker(current,threads); }
      catch(error) {
        current.worker?.close();
        assertActive(current);
        if(threads===1)throw error;
        report('Iniciando em modo compatível…');
        processingWorker=await loadWorker(current,1);
      }
    }
    current.worker=processingWorker;
    report('Lendo o MP3…');
    const Decoder=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    const decoded=await new Decoder(2,1,SAMPLE_RATE).decodeAudioData(await selected.arrayBuffer());
    assertActive(current);
    const original=channelData(decoded);
    const guitar=context.createBuffer(2,decoded.length,SAMPLE_RATE);
    const backing=context.createBuffer(2,decoded.length,SAMPLE_RATE);
    const started=performance.now();
    report('Separando guitarra…',0);
    await separarFaixas(original,channelData(guitar),async(left,right,overlap)=>{
      assertActive(current);
      const {result}=await processingWorker.send({type:'separate',left,right,overlap},[left.buffer,right.buffer]);
      return result.guitar;
    },fraction=>report('Separando guitarra · '+Math.round(fraction*100)+'% · '+clock((performance.now()-started)/1000),fraction));
    assertActive(current);
    tirarGuitarra(original,channelData(guitar),channelData(backing));
    tracks={guitar,backing};
    $('seek').max=decoded.duration;
    $('mode').value='guitar';
    $('results').hidden=false;
    report('Guitarra e base prontas para estudar.');
  } catch(error) {
    current.worker?.close();
    processingWorker=null;
    report(current.signal.aborted?'Separação cancelada.':error.message);
  } finally {
    job=null;
    interfaceState(false);
  }
};

$('cancel').onclick=()=>{job?.abort();job?.worker?.close();};
$('play').onclick=()=>play().catch(error=>report(error.message));
$('mode').onchange=()=>{const playing=Boolean(player);stop();if(playing)$('play').onclick();};
$('seek').oninput=()=>{
  const next=Number($('seek').value), playing=Boolean(player);
  stop();
  offset=next;
  position();
  if(playing)$('play').onclick();
};

$('save').onclick=async()=>{
  if(job||!tracks)return;
  const current=new AbortController();
  job=current;
  interfaceState(true);
  const mode=$('mode').value;
  const data=channelData(tracks[mode]);
  try {
    const encoder=client('./mp3-worker.js');
    current.worker=encoder;
    await encoder.send({type:'init',sampleRate:SAMPLE_RATE,bitrate:192});
    const parts=[];
    for(let start=0;start<data.left.length;start+=65536){
      assertActive(current);
      const left=data.left.slice(start,start+65536),right=data.right.slice(start,start+65536);
      const {bytes}=await encoder.send({type:'encode',left,right},[left.buffer,right.buffer]);
      parts.push(bytes);
      report('Exportando MP3…',Math.min(1,(start+65536)/data.left.length));
    }
    parts.push((await encoder.send({type:'flush'})).bytes);
    assertActive(current);
    const url=URL.createObjectURL(new Blob(parts,{type:'audio/mpeg'}));
    const link=document.createElement('a');
    link.href=url;
    link.download=selected.name.replace(/\.mp3$/i,'')+(mode==='guitar'?' - So guitarra':' - Sem guitarra')+'.mp3';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    report('MP3 preparado para baixar.');
  } catch(error) {
    report(current.signal.aborted?'Exportação cancelada.':error.message);
  } finally {
    current.worker?.close();
    job=null;
    interfaceState(false);
  }
};
