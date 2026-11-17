// Copy the Firebase web app values from Firebase Console > Project settings.
export const firebaseConfig = {
  apiKey: "AIzaSyB4MlTaPcSrK6KPEflPJ2R9gs1SL4qCYzo",
    authDomain: "saint-b9d20.firebaseapp.com",
    projectId: "saint-b9d20",
    storageBucket: "saint-b9d20.firebasestorage.app",
    messagingSenderId: "245000520602",
    appId: "1:245000520602:web:bb957a2415195978a4f023",
};

export const isFirebaseConfigured =
  !Object.values(firebaseConfig).some((value) => value.startsWith("YOUR_"));
