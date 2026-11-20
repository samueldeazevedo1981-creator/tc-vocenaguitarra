const names=['guitar','backing','instrumental'];

export async function separarOnline(file,signal,onProgress) {
  if(!navigator.onLine)throw Error('Conecte-se à internet para separar um MP3 novo.');
  if(file.size>100000000)throw Error('Este MP3 ultrapassa 100 MB. Escolha um arquivo menor para separar as faixas.');
  const response=await fetch('./api/separar',{
    method:'POST',headers:{'Content-Type':'audio/mpeg'},body:file,signal
  });
  if(response.status===413)throw Error('Este MP3 ultrapassa 100 MB. Escolha um arquivo menor para separar as faixas.');
  if(response.status===503)throw Error('O servidor está ocupado. Tente novamente em instantes.');
  if(!response.ok||!response.body)throw Error('Não foi possível iniciar a separação no servidor.');

  const reader=response.body.getReader();
  let pending=new Uint8Array();
  async function read(size) {
    const parts=[];
    while(size){
      if(!pending.length){
        const {done,value}=await reader.read();
        if(done)throw Error('A conexão foi interrompida durante a separação.');
        pending=value;
      }
      const used=Math.min(size,pending.length);
      parts.push(pending.subarray(0,used));
      pending=pending.subarray(used);
      size-=used;
    }
    return parts;
  }

  const edited={};
  const decoder=new TextDecoder();
  let duration;
  try {
    while(!names.every(name=>edited[name])){
      const header=new Uint8Array(5);
      let offset=0;
      for(const part of await read(5)){
        header.set(part,offset);
        offset+=part.length;
      }
      const kind=header[0], size=new DataView(header.buffer).getUint32(1);
      const name=names[kind-3];
      if(!size||size>(name?15000000:1024))throw Error('O servidor devolveu uma resposta inválida.');
      const blob=new Blob(await read(size),{type:name?'audio/mpeg':''});
      if(name)edited[name]=blob;
      else{
        const value=JSON.parse(decoder.decode(await blob.arrayBuffer()));
        if(kind===1)onProgress(value);
        else if(kind===2)duration=value;
        else if(kind===6)throw Error(value);
        else throw Error('O servidor devolveu uma resposta inválida.');
      }
    }
    if(!Number.isFinite(duration)||duration<=0)throw Error('A duração da música não foi recebida.');
    return {file,edited,length:Math.round(duration*44100)};
  }finally{
    await reader.cancel().catch(()=>{});
  }
}
