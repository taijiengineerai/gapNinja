/* gapNinja — Firebase integration (ES module, loaded via CDN — no npm install needed).
   Provides: window.GapNinja.Auth (Google sign-in) and window.GapNinja.Storage (Firestore-backed,
   same method names as the old localStorage layer, but every call now returns a Promise).
   Each signed-in user's data lives under Firestore path: users/{uid}/<collection>/{docId}
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  addDoc,
  getDocs,
  query,
  orderBy,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const cfg = window.GAPNINJA_FIREBASE_CONFIG || {};
const isConfigured = cfg.apiKey && cfg.apiKey.indexOf("YOUR_") !== 0;

window.GapNinja = window.GapNinja || {};
window.GapNinja.firebaseConfigured = isConfigured;

if (!isConfigured) {
  // No project configured yet — surface this clearly instead of throwing on every call.
  const notConfiguredError = () => Promise.reject(new Error("Firebase isn't configured yet. Add your project keys to js/firebase-config.js — see README.md."));
  window.GapNinja.Auth = {
    signIn: notConfiguredError,
    signUpEmail: notConfiguredError,
    signInEmail: notConfiguredError,
    resetPassword: notConfiguredError,
    signOut: () => Promise.resolve(),
    onChange: (cb) => cb(null),
    current: () => null,
  };
  window.GapNinja.Storage = null;
  window.GapNinja.Admin = {
    isAdmin: () => Promise.resolve(false),
    grant: notConfiguredError,
    revoke: notConfiguredError,
    listAdminUids: () => Promise.resolve([]),
    listAllUsers: () => Promise.resolve([]),
    listAllActivity: () => Promise.resolve([]),
    listAllSupportTickets: () => Promise.resolve([]),
    replyToSupportTicket: notConfiguredError,
  };
  window.dispatchEvent(new CustomEvent("gapninja-firebase-ready", { detail: { configured: false } }));
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  // Fail fast instead of Firebase's default ~10 min retry window — if Storage isn't
  // set up yet (or a request is blocked), resume text/skills should still save without
  // the UI hanging. Once Storage is fully configured this has no effect on success cases.
  storage.maxUploadRetryTime = 5000;
  storage.maxOperationRetryTime = 5000;
  const provider = new GoogleAuthProvider();

  function currentUid() {
    return auth.currentUser ? auth.currentUser.uid : null;
  }

  // Generic CRUD over users/{uid}/<name>/{docId}
  function makeCollectionApi(name) {
    return {
      async list() {
        const uid = currentUid();
        if (!uid) return [];
        const q = query(collection(db, "users", uid, name), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async get(id) {
        const uid = currentUid();
        if (!uid || !id) return null;
        const snap = await getDoc(doc(db, "users", uid, name, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      },
      async add(record) {
        const uid = currentUid();
        if (!uid) throw new Error("You're not signed in.");
        const payload = Object.assign({}, record, { createdAt: Date.now() });
        const ref = await addDoc(collection(db, "users", uid, name), payload);
        return Object.assign({ id: ref.id }, payload);
      },
      async update(id, patch) {
        const uid = currentUid();
        if (!uid) throw new Error("You're not signed in.");
        const payload = Object.assign({}, patch, { updatedAt: Date.now() });
        await updateDoc(doc(db, "users", uid, name, id), payload);
        return this.get(id);
      },
      async remove(id) {
        const uid = currentUid();
        if (!uid) throw new Error("You're not signed in.");
        await deleteDoc(doc(db, "users", uid, name, id));
      },
    };
  }

  // Resumes are the one collection that also needs the ORIGINAL FILE, not just its extracted
  // text — so you can view exactly what you uploaded later, not a re-rendered guess at it. The
  // Firestore doc (label, filename, rawText, skillCount) is the source of truth for matching and
  // listing; the actual PDF bytes live in Cloud Storage at users/{uid}/resumes/{resumeId}.pdf,
  // with a pdfUrl field on the Firestore doc pointing at it once the upload finishes.
  // File upload is deliberately best-effort: if it fails, the resume record (and matching) is
  // still saved — you just won't get a "View" button for that one, same as resumes uploaded
  // before this feature existed.
  const resumesApi = makeCollectionApi("resumes");
  const resumesBaseAdd = resumesApi.add.bind(resumesApi);
  const resumesBaseRemove = resumesApi.remove.bind(resumesApi);

  resumesApi.add = async function (record, file) {
    const created = await resumesBaseAdd(record);
    if (file) {
      try {
        const uid = currentUid();
        const path = `users/${uid}/resumes/${created.id}.pdf`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file, { contentType: "application/pdf" });
        const pdfUrl = await getDownloadURL(fileRef);
        await resumesApi.update(created.id, { pdfUrl, pdfPath: path });
        created.pdfUrl = pdfUrl;
        created.pdfPath = path;
      } catch (e) {
        console.error("Saving the viewable PDF file failed (resume text and matching were still saved fine):", e);
      }
    }
    return created;
  };

  resumesApi.remove = async function (id) {
    const uid = currentUid();
    if (uid && id) {
      try {
        await deleteObject(storageRef(storage, `users/${uid}/resumes/${id}.pdf`));
      } catch (e) {
        // Fine if there's nothing to delete — resumes uploaded before this feature existed, or
        // the file upload failed at save time, never had a file in Storage to begin with.
      }
    }
    return resumesBaseRemove(id);
  };

  const companiesApi = makeCollectionApi("companies");
  companiesApi.findByName = async function (name) {
    const items = await companiesApi.list();
    return items.find((c) => (c.name || "").trim().toLowerCase() === (name || "").trim().toLowerCase()) || null;
  };

  // A single shared counter document (counters/supportTickets, { next: <number> }) hands out
  // sequential ticket numbers starting at 1001, so tickets read like a normal support system's
  // (#1001, #1002, ...) instead of a random string. Any signed-in user can read/write this one
  // doc (see firestore.rules) since regular users are the ones creating tickets, not just
  // admins — worst case a race condition skips a number, which is harmless; a Firestore
  // transaction still prevents two submissions from ever getting the SAME number.
  async function allocateTicketNumber() {
    const counterRef = doc(db, "counters", "supportTickets");
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() && typeof snap.data().next === "number" ? snap.data().next : 1001;
      tx.set(counterRef, { next: current + 1 }, { merge: true });
      return current;
    });
  }

  const supportTicketsApi = makeCollectionApi("supportTickets");
  const supportTicketsBaseAdd = supportTicketsApi.add.bind(supportTicketsApi);
  supportTicketsApi.add = async function (record) {
    const ticketNumber = await allocateTicketNumber();
    return supportTicketsBaseAdd(Object.assign({ ticketNumber }, record));
  };

  const Storage = {
    resumes: resumesApi,
    companies: companiesApi,
    applications: makeCollectionApi("applications"),
    tasks: makeCollectionApi("tasks"),
    links: makeCollectionApi("links"),
    favoriteCompanies: makeCollectionApi("favoriteCompanies"),
    summaries: makeCollectionApi("summaries"),
    supportTickets: supportTicketsApi,
    profile: {
      async get() {
        const uid = currentUid();
        if (!uid) return { name: "", email: "", phone: "", linkedin: "" };
        const snap = await getDoc(doc(db, "users", uid, "meta", "profile"));
        return snap.exists() ? snap.data() : { name: "", email: "", phone: "", linkedin: "" };
      },
      async save(profile) {
        const uid = currentUid();
        if (!uid) return;
        await setDoc(doc(db, "users", uid, "meta", "profile"), profile, { merge: true });
      },
    },
  };

  // Google sign-in via a popup is the smoothest UX, but plenty of real-world browsers block or
  // silently kill it: Safari's Intelligent Tracking Prevention, Firefox strict mode, in-app
  // browsers (Instagram/Facebook/LinkedIn webviews), and any browser with popups disabled. Try
  // the popup first — when it fails for one of those reasons, fall back to a full-page redirect,
  // which works everywhere since it doesn't depend on cross-window/third-party storage access.
  const POPUP_FALLBACK_CODES = [
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
    "auth/web-storage-unsupported",
    "auth/network-request-failed",
  ];

  async function signInWithGoogle() {
    try {
      return await signInWithPopup(auth, provider);
    } catch (e) {
      if (e && POPUP_FALLBACK_CODES.includes(e.code)) {
        return signInWithRedirect(auth, provider);
      }
      throw e;
    }
  }

  // Completes a sign-in that fell back to the redirect flow above. Runs once per page load; if
  // the user didn't arrive via a redirect this just resolves to null and does nothing.
  getRedirectResult(auth).catch((e) => {
    console.error("Google redirect sign-in failed:", e);
    window.dispatchEvent(new CustomEvent("gapninja-redirect-signin-error", { detail: { message: e && e.message, code: e && e.code } }));
  });

  const Auth = {
    signIn: signInWithGoogle,
    signUpEmail: (email, password) => createUserWithEmailAndPassword(auth, email, password),
    signInEmail: (email, password) => signInWithEmailAndPassword(auth, email, password),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    signOut: () => fbSignOut(auth),
    onChange: (cb) => onAuthStateChanged(auth, cb),
    current: () => auth.currentUser,
  };

  // Admin/superuser system. Whether a uid is an admin is determined solely by whether a document
  // exists at admins/{uid} — a top-level collection, deliberately NOT nested under users/{uid},
  // so a regular user can never grant themselves admin by writing to their own data (see
  // firestore.rules). Real enforcement lives in the security rules, not in this client code —
  // this is just a convenience wrapper; a non-admin calling these will get a permission-denied
  // error from Firestore, same as if they tried it from the browser console directly.
  const Admin = {
    async isAdmin(uid) {
      const targetUid = uid || currentUid();
      if (!targetUid) return false;
      try {
        const snap = await getDoc(doc(db, "admins", targetUid));
        return snap.exists();
      } catch (e) {
        return false;
      }
    },
    async grant(uid) {
      if (!uid) throw new Error("Missing user id.");
      await setDoc(doc(db, "admins", uid), { addedAt: Date.now(), addedBy: currentUid() });
    },
    async revoke(uid) {
      if (!uid) throw new Error("Missing user id.");
      await deleteDoc(doc(db, "admins", uid));
    },
    async listAdminUids() {
      const snap = await getDocs(collection(db, "admins"));
      return snap.docs.map((d) => d.id);
    },
    // Enumerates every user who has ever saved a profile, via a collection-group query across
    // every users/{uid}/meta/profile doc. The parent user's uid is recovered from the document's
    // own path (doc.ref.parent.parent is the users/{uid} doc) since profile docs don't store
    // their own uid as a field.
    async listAllUsers() {
      const snap = await getDocs(collectionGroup(db, "meta"));
      return snap.docs
        .filter((d) => d.id === "profile")
        .map((d) => {
          const uid = d.ref.parent.parent ? d.ref.parent.parent.id : null;
          return Object.assign({ uid }, d.data());
        })
        .filter((u) => u.uid);
    },
    // Every job-queue link and every saved comparison, across every user, in one shot. No
    // orderBy on purpose — collection-group queries with orderBy need a composite index created
    // in the Firebase Console first; sorting client-side avoids that extra setup step entirely.
    async listAllActivity() {
      const [tasksSnap, appsSnap] = await Promise.all([
        getDocs(collectionGroup(db, "tasks")),
        getDocs(collectionGroup(db, "applications")),
      ]);
      const tasks = tasksSnap.docs.map((d) => {
        const uid = d.ref.parent.parent ? d.ref.parent.parent.id : null;
        return Object.assign({ id: d.id, uid, type: "queued" }, d.data());
      });
      const apps = appsSnap.docs.map((d) => {
        const uid = d.ref.parent.parent ? d.ref.parent.parent.id : null;
        return Object.assign({ id: d.id, uid, type: "comparison" }, d.data());
      });
      return tasks.concat(apps).filter((r) => r.uid);
    },
    // Every support ticket submitted by any user, in one shot — powers the Admin Dashboard's
    // Support Tickets card. No orderBy for the same reason as listAllActivity() above (avoids
    // needing a composite index); sorted client-side by the caller instead.
    async listAllSupportTickets() {
      const snap = await getDocs(collectionGroup(db, "supportTickets"));
      return snap.docs
        .map((d) => {
          const uid = d.ref.parent.parent ? d.ref.parent.parent.id : null;
          return Object.assign({ id: d.id, uid }, d.data());
        })
        .filter((t) => t.uid);
    },
    // Writes a reply (and any other patch fields, e.g. status) onto ANOTHER user's ticket —
    // makeCollectionApi's update() only ever writes to the currently signed-in user's own path,
    // which doesn't work here since the admin is writing into a different uid's subtree. Allowed
    // by firestore.rules' dedicated supportTickets collection-group rule (read+write for admins,
    // unlike the read-only rule the other admin views use).
    async replyToSupportTicket(uid, ticketId, patch) {
      if (!uid || !ticketId) throw new Error("Missing ticket reference.");
      const payload = Object.assign({}, patch, { updatedAt: Date.now() });
      await updateDoc(doc(db, "users", uid, "supportTickets", ticketId), payload);
    },
  };

  window.GapNinja.Auth = Auth;
  window.GapNinja.Storage = Storage;
  window.GapNinja.Admin = Admin;
  window.dispatchEvent(new CustomEvent("gapninja-firebase-ready", { detail: { configured: true } }));
}
