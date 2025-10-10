// src/shared/firebase/syncFcmToken.js
import { getToken } from "firebase/messaging";
import axiosInstance from "../../../axiosInstance";
import { messaging } from "../../user/firebase/firebaseConfig";

export async function syncFcmToken() {
  // 1) Wait for SW ready
  const registration = await navigator.serviceWorker.ready;

  // 2) Get token from FCM
  const token = await getToken(messaging, {
    serviceWorkerRegistration: registration,
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  });
  if (!token) throw new Error("No FCM token available");

  // 3) Only re‑sync if it changed
  const prev = localStorage.getItem("fcmToken");
  if (token !== prev) {
    localStorage.setItem("fcmToken", token);
    await axiosInstance.post(
      "/api/user/update-token",
      { fcmToken: token },
      { withCredentials: true }
    );
    console.log("🔄 FCM token synced:", token);
  }

  return token;
}
