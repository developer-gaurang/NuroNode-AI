import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

const cfg = {
  apiKey: 'AIzaSyB1Edbiw9MI6QaIJObP1gYmQASaScDiagA',
  authDomain: 'nuronode-ai.firebaseapp.com',
  projectId: 'nuronode-ai',
  storageBucket: 'nuronode-ai.firebasestorage.app',
  messagingSenderId: '251788912734',
  appId: '1:251788912734:web:a56bbb63f536097dcc2ccf',
};

const app = initializeApp(cfg);

for (const bucket of ['gs://nuronode-ai.firebasestorage.app', 'gs://nuronode-ai.appspot.com']) {
  try {
    const storage = getStorage(app, bucket);
    await uploadBytes(ref(storage, `smoke-${Date.now()}.txt`), new Blob(['x'], { type: 'text/plain' }));
    console.log(bucket, 'ok');
  } catch (error) {
    console.log(bucket, error.code, error.status_, String(error.message).slice(0, 160));
  }
}
