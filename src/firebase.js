import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyB1Edbiw9MI6QaIJObP1gYmQASaScDiagA',
  authDomain: 'nuronode-ai.firebaseapp.com',
  projectId: 'nuronode-ai',
  storageBucket: 'nuronode-ai.firebasestorage.app',
  messagingSenderId: '251788912734',
  appId: '1:251788912734:web:a56bbb63f536097dcc2ccf',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
