const databaseName='trucker-cap-guitarra-estudo';
const storeName='setlists';
const currentKey='principal';

async function access(write,songs) {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(databaseName,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction(storeName,write?'readwrite':'readonly');
      const store=transaction.objectStore(storeName);
      const request=write?store.put({songs},currentKey):store.get(currentKey);
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error||request.error);
      transaction.onerror=()=>reject(transaction.error||request.error);
    });
  } finally {
    db.close();
  }
}

export function salvarSetlist(songs) {
  return access(true,songs);
}

export async function abrirSetlist() {
  const record=await access(false);
  return record?.songs??null;
}
