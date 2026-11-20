export async function repertoire(action, value, storeName = 'songs') {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('TRUCKER_CAP_REPERTOIRE', 2);
    request.onupgradeneeded = event => {
      if (event.oldVersion < 1) request.result.createObjectStore('songs', {keyPath:'id'});
      request.result.createObjectStore('imports', {keyPath:'id', autoIncrement:true});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const readonly = ['get', 'keys', 'getAll'].includes(action);
      const tx = db.transaction(storeName, readonly ? 'readonly' : 'readwrite');
      const store = tx.objectStore(storeName);
      if (action === 'addFiles') {
        const [first, ...rest] = value;
        const request = store.add({file:first});
        for (const file of rest) store.add({file});
        tx.oncomplete = () => resolve(request.result);
      } else {
        const request = action === 'keys' ? store.getAllKeys() : store[action](value);
        tx.oncomplete = () => resolve(request.result);
      }
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
