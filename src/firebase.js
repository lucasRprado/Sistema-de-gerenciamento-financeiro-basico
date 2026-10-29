// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Você pegará essas chaves no site do Firebase Console (console.firebase.google.com)
const firebaseConfig = {
  apiKey: "AIzaSyANonsgEPzEB-2vKHub9xjSKJBIYrL_8vY",
  authDomain: "acampamento-admin.firebaseapp.com",
  projectId: "acampamento-admin",
  storageBucket: "acampamento-admin.firebasestorage.app",
  messagingSenderId: "715755662422",
  appId: "1:715755662422:web:c760f51c2e33ff51bd9ff7"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as funções de Banco de Dados (Firestore) e Arquivos (Storage)
export const db = getFirestore(app);
export const storage = getStorage(app);