// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "ai-rate-my-prof.firebaseapp.com",
  projectId: "ai-rate-my-prof",
  storageBucket: "ai-rate-my-prof.appspot.com",
  messagingSenderId: "523979725125",
  appId: "1:523979725125:web:e975fb0e32e47f7a4e062c",
  measurementId: "G-KLJ8Z5BNRK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };