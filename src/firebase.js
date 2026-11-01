// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Você pegará essas chaves no site do Firebase Console (console.firebase.google.com)
const firebaseConfig = {
  apiKey: "INSIRA SUAS CREDENCIAIS",
  authDomain: "INSIRA SUAS CREDENCIAIS",
  projectId: "INSIRA SUAS CREDENCIAIS",
  storageBucket: "INSIRA SUAS CREDENCIAIS",
  messagingSenderId: "INSIRA SUAS CREDENCIAIS",
  appId: "INSIRA SUAS CREDENCIAIS"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as funções de Banco de Dados (Firestore) e Arquivos (Storage)
export const db = getFirestore(app);
export const storage = getStorage(app);
