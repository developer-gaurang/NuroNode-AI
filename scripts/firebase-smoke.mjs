import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyB1Edbiw9MI6QaIJObP1gYmQASaScDiagA',
  authDomain: 'nuronode-ai.firebaseapp.com',
  projectId: 'nuronode-ai',
  storageBucket: 'nuronode-ai.firebasestorage.app',
  messagingSenderId: '251788912734',
  appId: '1:251788912734:web:a56bbb63f536097dcc2ccf',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const suffix = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
const password = `NuroNode-${suffix}!`;
const users = [
  { email: `nuronode.smoke.${suffix}.a@example.com`, uid: '' },
  { email: `nuronode.smoke.${suffix}.b@example.com`, uid: '' },
];

async function createAndWrite(user, label) {
  const credential = await createUserWithEmailAndPassword(auth, user.email, password);
  user.uid = credential.user.uid;
  cleanup.push(user);
  await setDoc(doc(db, 'users', user.uid, 'profile', 'current'), {
    id: user.uid,
    fullName: `Smoke ${label}`,
    bloodGroup: label === 'A' ? 'O+' : 'B+',
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', user.uid, 'reports', `REPORT-${label}`), {
    id: `REPORT-${label}`,
    title: `Smoke Report ${label}`,
    createdAt: serverTimestamp(),
  });
  let imageUrl = '';
  let storageError = '';
  try {
    const fileRef = ref(storage, `users/${user.uid}/profile/smoke.txt`);
    await uploadBytes(fileRef, new Blob([`NuroNode smoke ${label}`], { type: 'text/plain' }));
    imageUrl = await getDownloadURL(fileRef);
  } catch (error) {
    storageError = error.message;
  }
  await sendPasswordResetEmail(auth, user.email);
  await signOut(auth);
  return { imageUrl, storageError };
}

const cleanup = [];

try {
  const storageA = await createAndWrite(users[0], 'A');
  const storageB = await createAndWrite(users[1], 'B');

  await signInWithEmailAndPassword(auth, users[0].email, password);
  const own = await getDoc(doc(db, 'users', users[0].uid, 'profile', 'current'));
  await signOut(auth);

  await signInWithEmailAndPassword(auth, users[1].email, password);
  let isolation = 'blocked';
  try {
    const other = await getDoc(doc(db, 'users', users[0].uid, 'profile', 'current'));
    isolation = other.exists() ? 'readable' : 'not-found';
  } catch {
    isolation = 'blocked';
  }

  console.log(JSON.stringify({
    signup: users.every((user) => user.uid),
    login: Boolean(auth.currentUser),
    forgotPassword: true,
    firestore: own.exists(),
    storage: Boolean(storageA.imageUrl && storageB.imageUrl),
    storageError: storageA.storageError || storageB.storageError || '',
    userIsolation: isolation,
    users: users.map((user) => user.uid),
  }, null, 2));
} finally {
  for (const user of cleanup.reverse()) {
    try {
      if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
        await signInWithEmailAndPassword(auth, user.email, password);
      }
      await deleteUser(auth.currentUser);
    } catch (error) {
      console.error(`cleanup failed for ${user.email}: ${error.message}`);
    }
  }
}
