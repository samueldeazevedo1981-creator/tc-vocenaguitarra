import {clock,SAMPLE_RATE,playbackAudio} from './audio-utils.js';
import {separarFaixas,compactarFaixa,montarFaixa} from './faixas.js';

import {salvarSetlist,abrirSetlist} from './setlist-storage.js';

const $=id=>document.getElementById(id);
const fileInput=$('file'), progress=$('progress'), status=$('status');
const originalAudio=$('original'), speed=$('speed'), modes=[...document.querySelectorAll('[data-mode]')], songs=[];
let context, selected, activeSong, decodedOriginal, renderCache, processingWorker, job;
let storageBusy=false, setlistAlterado=false;
let mode='original', audioURL, playbackRequest=0;
let preparingTrack=false, activeSource=false;

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
  active=active||storageBusy;
  $('saveSetlist').disabled=active||(!songs.length&&!setlistAlterado);
  $('openSetlist').disabled=active;
  fileInput.disabled=active;
  $('separate').disabled=active||!selected||Boolean(activeSong);
  updateModes();
  $('cancel').hidden=!job;

  progress.hidden=!active;
  renderSetlist();
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
  playbackRequest++;
  preparingTrack=false;
  originalAudio.pause();
  if(reset&&originalAudio.readyState)originalAudio.currentTime=0;
  updateModes();
}

function applySpeed() {
  originalAudio.preservesPitch=true;
  originalAudio.webkitPreservesPitch=true;
  originalAudio.defaultPlaybackRate=Number(speed.value)||1;
  originalAudio.playbackRate=originalAudio.defaultPlaybackRate;
}

function audioContext() {
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  return context??=new AudioContext();
}

function updateModes() {
  const busy=Boolean(job)||storageBusy;
  for(const button of modes){
    const active=button.dataset.mode===mode;
    button.setAttribute('aria-pressed',String(active));
    button.disabled=busy||!selected||(!activeSong&&button.dataset.mode!=='original');
  }
  $('save').disabled=busy||!selected||preparingTrack;
  speed.disabled=!activeSource;
}

function setAudioSource(source,position=0,resume=false) {
  if(audioURL)URL.revokeObjectURL(audioURL);
  audioURL=source?URL.createObjectURL(source):null;
  activeSource=Boolean(audioURL);
  originalAudio.onloadedmetadata=audioURL?()=>{
    applySpeed();
    originalAudio.currentTime=Math.min(position,originalAudio.duration||position);
    if(resume&&!job&&!storageBusy)originalAudio.play().catch(()=>{});
  }:null;
  if(audioURL)originalAudio.src=audioURL;
  else originalAudio.removeAttribute('src');
  originalAudio.load();
  applySpeed();
}

async function changeMode(next) {
  if(job||storageBusy||!selected||(!activeSong&&next!=='original'))return;
  if(next===mode&&(activeSource||preparingTrack))return;
  const position=originalAudio.currentTime||0;
  const resume=activeSource&&!originalAudio.paused;
  stop();
  const current=++playbackRequest;
  mode=next;
  updateModes();
  if(next==='original'){
    renderCache=null;
    setAudioSource(selected,position,resume);
    updateModes();
    return;
  }
  preparingTrack=true;
  setAudioSource(null);
  updateModes();
  try {
    audioContext();
    const buffer=await preparePlayback(activeSong,next,()=>current===playbackRequest);
    if(!buffer||current!==playbackRequest)return;
    const pcm=channelData(buffer);
    setAudioSource(playbackAudio(pcm.left,pcm.right,SAMPLE_RATE),position,resume);
    renderCache=null;
  } catch(error) {
    if(current===playbackRequest)report(error.message);
  } finally {
    if(current===playbackRequest){
      preparingTrack=false;
      updateModes();
    }
  }
}

function assertActive(current) {
  if(current.signal.aborted)throw Error('Operação cancelada.');
}

async function decode(file) {
  const Decoder=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  return new Decoder(2,1,SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
}

async function preparePlayback(song,mode,isCurrent) {
  if(renderCache?.song===song&&renderCache.mode===mode)return renderCache.buffer;
  let original=decodedOriginal;
  if(mode!=='guitar'&&!original){
    const decoded=await decode(song.file);
    if(!isCurrent())return null;
    original=decodedOriginal=decoded;
  }
  renderCache=null;
  const buffer=context.createBuffer(2,song.length,SAMPLE_RATE);
  montarFaixa(song,mode,original&&channelData(original),channelData(buffer));
  renderCache={song,mode,buffer};
  return buffer;
}

function openSong(file,song) {
  stop(true);
  decodedOriginal=null;
  renderCache=null;
  selected=file;
  activeSong=song;
  mode='original';
  setAudioSource(file);
  $('results').hidden=!file;
  $('songTitle').textContent=file?.name||'';
  interfaceState(false);
}

function renderSetlist() {
  $('emptySetlist').hidden=Boolean(songs.length);
  $('saveSetlist').disabled=Boolean(job)||storageBusy||(!songs.length&&!setlistAlterado);
  $('songs').replaceChildren(...songs.map((song,index)=>{
    const row=document.createElement('li');
    const name=document.createElement('strong');
    name.className='song-name';
    name.textContent=song.file.name;
    const actions=document.createElement('div');
    actions.className='song-actions';
    const button=(label,disabled,action)=>{
      const el=document.createElement('button');
      el.className='secondary';
      el.textContent=label;
      el.disabled=Boolean(job)||storageBusy||disabled;
      el.onclick=action;
      return el;
    };
    const move=delta=>{
      songs.splice(index,1);
      songs.splice(index+delta,0,song);
      setlistAlterado=true;
      renderSetlist();
    };
    actions.append(
      button(activeSong===song?'Aberta':'Abrir',activeSong===song,()=>{
        openSong(song.file,song);
        report('Música pronta no setlist.');
      }),
      button('Subir',index===0,()=>move(-1)),
      button('Descer',index===songs.length-1,()=>move(1)),
      button('Remover',false,()=>{
        songs.splice(index,1);
        setlistAlterado=true;
        if(activeSong===song)openSong(song.file,null);
        else renderSetlist();
      })
    );
    row.append(name,actions);
    return row;
  }));
}

fileInput.onchange=()=>{
  if(storageBusy||job)return;
  const file=fileInput.files[0];
  fileInput.value='';
  if(!file||!/\.mp3$/i.test(file.name))return;
  const song=songs.find(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified);
  openSong(song?.file||file,song);
  report(song?'Música pronta no setlist.':'MP3 selecionado. Clique em Separar guitarra.');
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
  if(!selected||job||storageBusy)return;
  const current=new AbortController();
  job=current;
  interfaceState(true);
  stop(true);

  try {
    await audioContext().resume();
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
    const file=selected,decoded=await decode(file);
    assertActive(current);
    const original=channelData(decoded);
    const stereo=()=>({left:new Float32Array(decoded.length),right:new Float32Array(decoded.length)});
    const separated={guitar:stereo(),vocals:stereo()};
    const started=performance.now();
    report('Separando guitarra e voz…',0);
    await separarFaixas(original,separated,async(left,right,overlap)=>{
      assertActive(current);
      const {result}=await processingWorker.send({type:'separate',left,right,overlap},[left.buffer,right.buffer]);
      return result;
    },fraction=>report('Separando guitarra e voz · '+Math.round(fraction*100)+'% · '+clock((performance.now()-started)/1000),fraction));
    assertActive(current);
    const song={file,length:decoded.length,guitar:compactarFaixa(separated.guitar),vocals:compactarFaixa(separated.vocals)};
    songs.push(song);
    setlistAlterado=true;
    openSong(file,song);
    decodedOriginal=decoded;
    report('Faixas prontas. Música adicionada ao setlist da sessão.');
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
for(const button of modes)button.onclick=()=>changeMode(button.dataset.mode);
speed.onchange=applySpeed;

$('save').onclick=async()=>{
  if(job||storageBusy||preparingTrack||!selected)return;
  if(mode==='original'){download(selected,selected.name);return;}
  if(!activeSong)return;
  stop();
  const current=new AbortController();
  job=current;
  interfaceState(true);
  try {
    audioContext();
    const buffer=await preparePlayback(activeSong,mode,()=>!current.signal.aborted);
    assertActive(current);
    const data=channelData(buffer);
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
    const suffix={guitar:'Guitarra isolada',backing:'Sem guitarra',instrumental:'Sem voz e guitarra'};
    download(new Blob(parts,{type:'audio/mpeg'}),selected.name.replace(/\.mp3$/i,'')+' - '+suffix[mode]+'.mp3');
    report('MP3 preparado para baixar.');
  } catch(error) {
    report(current.signal.aborted?'Exportação cancelada.':error.message);
  } finally {
    current.worker?.close();
    job=null;
    interfaceState(false);
  }
};


function download(blob,name) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

$('saveSetlist').onclick=async()=>{
  if(job||storageBusy||(!songs.length&&!setlistAlterado))return;
  storageBusy=true;
  interfaceState(false);
  report('Salvando a ordem e as faixas no aparelho…');
  try {
    await salvarSetlist(songs);
    setlistAlterado=false;
    report('Setlist salvo neste navegador.');
  } catch(error) {
    report(error?.name==='QuotaExceededError'
      ? 'Espaço insuficiente. A cópia salva anteriormente foi mantida.'
      : 'Não foi possível salvar o setlist neste navegador.');
  } finally {
    storageBusy=false;
    interfaceState(false);
  }
};

$('openSetlist').onclick=async()=>{
  if(job||storageBusy)return;
  if(setlistAlterado&&!window.confirm('Carregar o setlist salvo e descartar as alterações da sessão?'))return;
  storageBusy=true;
  interfaceState(false);
  report('Abrindo o setlist salvo…');
  try {
    const saved=await abrirSetlist();
    if(saved===null){report('Ainda não há um setlist salvo neste navegador.');return;}
    songs.length=0;
    for(const song of saved)songs.push(song);
    setlistAlterado=false;
    openSong(songs[0]?.file,songs[0]);
    report(songs.length?'Setlist aberto. As faixas já estão separadas.':'O setlist salvo está vazio.');
  } catch {
    report('Não foi possível abrir o setlist salvo.');
  } finally {
    storageBusy=false;
    interfaceState(false);
  }
};


async function prepararAberturaOffline() {
  const indicator=$('offlineStatus');
  if(!('serviceWorker' in navigator))return;
  indicator.hidden=false;
  indicator.textContent='Preparando abertura offline…';
  try {
    const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    const shell=new URL('./index.html',registration.scope).href;
    const ready=async()=>{
      if(!navigator.serviceWorker.controller)return;
      const cached=await caches.match(shell,{cacheName:'trucker-cap-estudo-offline-2'});
      if(cached)indicator.textContent='App pronto para abrir offline neste navegador.';
    };
    navigator.serviceWorker.addEventListener('controllerchange',()=>{ready().catch(()=>{});});
    await ready();
    const installing=registration.installing;
    if(installing)installing.addEventListener('statechange',()=>{
      if(installing.state==='redundant'&&!navigator.serviceWorker.controller)
        indicator.textContent='Não foi possível preparar a abertura offline.';
    });
  } catch {
    indicator.textContent='Não foi possível preparar a abertura offline.';
  }
}

prepararAberturaOffline();
