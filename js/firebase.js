import { firebaseConfig } from "../config/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Recommended Firestore rules shape for this app:
// units + availability: public read, authenticated write
// booking_requests: public create, authenticated read/update/delete

const isConfigured = Object.values(firebaseConfig).every(
  (value) => value && typeof value === "string" && !value.startsWith("YOUR_")
);

const app = isConfigured ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn("Auth persistence could not be enabled", error);
  });
}

function assertFirebaseConfigured() {
  if (!db || !auth) {
    throw new Error("يرجى إعداد Firebase في config/firebase-config.js أولاً.");
  }
}

function mapSnapshot(snapshot) {
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data()
    }))
    .sort((left, right) => {
      const leftTime = left.created_at?.seconds || left.updated_at?.seconds || 0;
      const rightTime = right.created_at?.seconds || right.updated_at?.seconds || 0;
      return rightTime - leftTime;
    });
}

export function firebaseReady() {
  return isConfigured;
}

export function listenToUnits(onChange, onError = console.error) {
  if (!db) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "units"),
    (snapshot) => {
      onChange(mapSnapshot(snapshot));
    },
    onError
  );
}

export function listenToUnit(unitId, onChange, onError = console.error) {
  if (!db || !unitId) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "units", unitId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }

      onChange({
        id: snapshot.id,
        ...snapshot.data()
      });
    },
    onError
  );
}

export function listenToAvailability(unitId, onChange, onError = console.error) {
  if (!db || !unitId) {
    onChange([]);
    return () => {};
  }

  const availabilityQuery = query(collection(db, "availability"), where("unit_id", "==", unitId));

  return onSnapshot(
    availabilityQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .filter((entry) => entry.unit_id === unitId)
        .sort((left, right) => left.date.localeCompare(right.date));

      onChange(items);
    },
    onError
  );
}

export function listenToBookingRequests(onChange, onError = console.error) {
  if (!db) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "booking_requests"),
    (snapshot) => {
      onChange(mapSnapshot(snapshot));
    },
    onError
  );
}

export function onAdminAuthChange(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInAdmin(email, password) {
  assertFirebaseConfigured();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutAdmin() {
  assertFirebaseConfigured();
  return signOut(auth);
}

function sanitizeUnitPayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    description: String(payload.description || "").trim(),
    price_per_day: Number(payload.price_per_day || 0),
    location: String(payload.location || "").trim(),
    media: Array.isArray(payload.media) ? payload.media.filter(Boolean) : [],
    video_url: payload.video_url || "",
    show_availability: Boolean(payload.show_availability)
  };
}

export async function createUnit(payload) {
  assertFirebaseConfigured();

  const unitRef = doc(collection(db, "units"));
  await setDoc(unitRef, {
    ...sanitizeUnitPayload(payload),
    slug: payload.slug,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });

  return unitRef.id;
}

export async function updateUnit(unitId, payload) {
  assertFirebaseConfigured();
  const unitRef = doc(db, "units", unitId);

  await updateDoc(unitRef, {
    ...sanitizeUnitPayload(payload),
    slug: payload.slug,
    updated_at: serverTimestamp()
  });
}

export async function deleteUnit(unitId) {
  assertFirebaseConfigured();
  const batch = writeBatch(db);
  const availabilitySnapshot = await getDocs(
    query(collection(db, "availability"), where("unit_id", "==", unitId))
  );

  availabilitySnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((entry) => entry.unit_id === unitId)
    .forEach((entry) => {
      batch.delete(doc(db, "availability", entry.id));
    });

  batch.delete(doc(db, "units", unitId));
  await batch.commit();
}

export async function saveAvailabilityRange({ unitId, from, to, status }) {
  assertFirebaseConfigured();
  const batch = writeBatch(db);
  const dates = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (cursor <= end) {
    const local = new Date(cursor);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    const date = local.toISOString().slice(0, 10);
    dates.push(date);
    cursor.setDate(cursor.getDate() + 1);
  }

  dates.forEach((date) => {
    const recordId = `${unitId}_${date}`;
    batch.set(doc(db, "availability", recordId), {
      unit_id: unitId,
      date,
      status,
      updated_at: serverTimestamp()
    });
  });

  await batch.commit();
}

export async function createBookingRequest(payload) {
  if (!db) {
    throw new Error("إعداد Firebase غير مكتمل.");
  }

  const requestRef = doc(collection(db, "booking_requests"));
  await setDoc(requestRef, {
    unit_id: payload.unit_id,
    unit_name: payload.unit_name,
    name: payload.name,
    phone: payload.phone,
    date_from: payload.date_from,
    date_to: payload.date_to,
    status: payload.status || "pending",
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });

  return requestRef.id;
}

export async function updateBookingStatus(requestId, status) {
  assertFirebaseConfigured();
  await updateDoc(doc(db, "booking_requests", requestId), {
    status,
    updated_at: serverTimestamp()
  });
}
