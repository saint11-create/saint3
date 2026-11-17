import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4z" /></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3c1.7 0 3 .7 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 .7 3 3Z" /></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 5H2v4h3l6 5zM15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 5H2v4h3l6 5zM17 9l5 6m0-6-5 6" /></svg>',
};

const feed = document.querySelector("#video-feed");
const emptyState = document.querySelector("#feed-empty");
const searchInput = document.querySelector("#search-input");
const searchBox = document.querySelector("#search-box");
const videoUpload = document.querySelector("#video-upload");
const commentsDialog = document.querySelector("#comments-dialog");
const accountDialog = document.querySelector("#account-dialog");
const uploadDialog = document.querySelector("#upload-dialog");
const commentList = document.querySelector("#comment-list");
const commentForm = document.querySelector("#comment-form");
const commentInput = document.querySelector("#comment-input");
const toast = document.querySelector("#toast");
const connectionBanner = document.querySelector("#connection-banner");

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;

let currentUser = null;
let videos = [];
let followedIds = new Set();
let activeFeed = "For you";
let activeCommentVideo = null;
let feedObserver = null;
let feedUnsubscribe = null;
let followingUnsubscribe = null;
let followingCountUnsubscribe = null;
let userVideosUnsubscribe = null;
let commentsUnsubscribe = null;
let renderSequence = 0;
let authMode = "sign-in";
let toastTimeout;
const videoUrls = new Map();
const cardUnsubscribes = [];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatCount(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}m`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setBanner(message = "") {
  connectionBanner.textContent = message;
  connectionBanner.hidden = !message;
}

function firebaseError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Try signing in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "That email and password didn’t match. Try again.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "storage/unauthorized": "Firebase Storage rejected this upload. Check your Storage rules.",
    "storage/canceled": "The upload was canceled.",
    "storage/quota-exceeded": "Storage quota reached. Check the Firebase project’s billing and storage.",
    "permission-denied": "Firebase blocked this action. Check that the Firestore rules in SETUP.md are published.",
    "unavailable": "Firebase is temporarily unavailable. Please try again.",
  };
  return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
}

function requireUser() {
  if (!isFirebaseConfigured) {
    showToast("Connect your Firebase project first — see SETUP.md.");
    return false;
  }
  if (!currentUser) {
    openAccount();
    return false;
  }
  return true;
}

function initials(name = "?") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function handleFor(user) {
  return user?.displayName
    ? `@${user.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator"}`
    : `@${(user?.email || "creator").split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator"}`;
}

function renderProfile() {
  const name = currentUser?.displayName || currentUser?.email?.split("@")[0] || "";
  document.querySelector("#profile-name").textContent = currentUser ? name : "Welcome to SAINT";
  document.querySelector("#profile-handle").textContent = currentUser ? handleFor(currentUser) : "Sign in to join in";
  document.querySelector("#profile-avatar").textContent = initials(name);
  document.querySelector("#mobile-avatar").textContent = initials(name);
  document.querySelector("#profile-bio").textContent = currentUser
    ? currentUser.email
    : "A feed made by people like you.";
  document.querySelector("#comment-avatar").textContent = initials(name);
  document.querySelector("#account-trigger").textContent = currentUser ? "Account" : "Sign in";
  document.querySelector("#toolbar-account").textContent = currentUser ? initials(name) : "Sign in";
  document.querySelector("#toolbar-account").setAttribute("aria-label", currentUser ? `Open ${name}'s account` : "Sign in");
  document.querySelector("#following-count").textContent = "0";
  document.querySelector("#video-count").textContent = "0";
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignUp = mode === "sign-up";
  document.querySelector("#account-title").textContent = isSignUp ? "Find your people." : "Come on in.";
  document.querySelector("#display-name-field").hidden = !isSignUp;
  document.querySelector("#display-name-input").required = isSignUp;
  document.querySelector("#password-input").autocomplete = isSignUp ? "new-password" : "current-password";
  document.querySelector("#account-submit").textContent = isSignUp ? "Create account" : "Sign in";
  document.querySelector("#account-switch").textContent = isSignUp
    ? "Already have an account? Sign in"
    : "New here? Create an account";
  document.querySelector("#reset-password").hidden = isSignUp;
  document.querySelector("#auth-error").hidden = true;
}

function openAccount() {
  if (!isFirebaseConfigured) {
    setBanner("Connect your Firebase project and publish the security rules to enable accounts. Follow SETUP.md.");
    return;
  }
  document.querySelector("#signed-out-panel").hidden = Boolean(currentUser);
  document.querySelector("#signed-in-panel").hidden = !currentUser;
  if (currentUser) {
    document.querySelector("#signed-in-title").textContent = `You’re in, ${currentUser.displayName || "creator"}.`;
    document.querySelector("#signed-in-email").textContent = currentUser.email || "";
  } else {
    setAuthMode("sign-in");
  }
  accountDialog.showModal();
}

function renderCreators() {
  const unique = new Map();
  videos.forEach((video) => {
    if (video.authorId !== currentUser?.uid && !unique.has(video.authorId)) unique.set(video.authorId, video);
  });
  const creators = [...unique.values()].slice(0, 5);
  document.querySelector("#creator-list").innerHTML = creators.length
    ? creators.map((creator) => {
      const isFollowing = followedIds.has(creator.authorId);
      return `<div class="creator-row">
        <div class="creator-avatar creator-letter">${escapeHtml(initials(creator.authorName))}</div>
        <div class="creator-info"><strong>${escapeHtml(creator.authorName)}</strong><span>${escapeHtml(creator.authorHandle)}</span></div>
        <button class="follow-mini ${isFollowing ? "is-following" : ""}" data-creator="${escapeHtml(creator.authorId)}" aria-label="${isFollowing ? "Unfollow" : "Follow"} ${escapeHtml(creator.authorName)}">${isFollowing ? "✓" : "+"}</button>
      </div>`;
    }).join("")
    : '<p class="creator-empty">Creators will show up here as videos are posted.</p>';
}

function cardTemplate(video) {
  const isFollowing = followedIds.has(video.authorId);
  const ownVideo = video.authorId === currentUser?.uid;
  const url = videoUrls.get(video.storagePath);
  return `<article class="video-card" data-video-id="${escapeHtml(video.id)}" aria-label="Video by ${escapeHtml(video.authorName)}">
      <div class="video-poster"></div>
      ${url ? `<video src="${escapeHtml(url)}" loop playsinline muted preload="none" aria-label="${escapeHtml(video.caption || "Video by " + video.authorName)}"></video>` : '<div class="video-unavailable">Preparing video…</div>'}
      <div class="video-topline">
        <span class="video-label"><span></span> ${video.createdAt ? "SAINT community" : "Just posted"}</span>
        <button class="sound-button" data-action="mute" aria-label="Turn sound on">${icons.muted}</button>
      </div>
      <div class="play-indicator" aria-hidden="true"></div>
      <div class="video-details">
        <div class="creator-line">
          <div class="creator-avatar video-avatar creator-letter" aria-hidden="true">${escapeHtml(initials(video.authorName))}</div>
          <div class="video-creator"><strong>${escapeHtml(video.authorName)}</strong><span>${escapeHtml(video.authorHandle)}</span></div>
          ${ownVideo ? "" : `<button class="follow-button ${isFollowing ? "is-following" : ""}" data-action="follow">${isFollowing ? "Following" : "Follow +"}</button>`}
        </div>
        <p class="video-caption">${escapeHtml(video.caption || "A new video from the SAINT community.")}</p>
        <div class="sound-credit">${icons.music}<span>original sound · ${escapeHtml(video.authorHandle)}</span></div>
      </div>
      <div class="video-actions">
        <button class="action-button like-button" data-action="like" aria-label="Like video">${icons.heart}<span>0</span></button>
        <button class="action-button" data-action="comments" aria-label="Read comments">${icons.comment}<span>0</span></button>
        <button class="action-button" data-action="share" aria-label="Share video">${icons.share}<span>Share</span></button>
        <div class="creator-disc"><span>${escapeHtml(initials(video.authorName))}</span></div>
      </div>
    </article>`;
}

function visibleVideos() {
  const search = searchInput.value.trim().toLowerCase().replace(/^#/, "");
  return videos.filter((video) => {
    const followsCreator = followedIds.has(video.authorId);
    const matchesFeed = activeFeed !== "Following" || followsCreator || video.authorId === currentUser?.uid;
    const searchable = `${video.authorName} ${video.authorHandle} ${video.caption}`.toLowerCase();
    return matchesFeed && (!search || searchable.includes(search));
  });
}

function updateCardStats(video, card) {
  const likesRef = collection(db, "videos", video.id, "likes");
  const commentsRef = collection(db, "videos", video.id, "comments");
  const unsubscribeLikes = onSnapshot(likesRef, (snapshot) => {
    if (!card.isConnected) return;
    const likeButton = card.querySelector('[data-action="like"]');
    likeButton.querySelector("span").textContent = formatCount(snapshot.size);
    const liked = Boolean(currentUser && snapshot.docs.some((like) => like.id === currentUser.uid));
    likeButton.classList.toggle("is-liked", liked);
    likeButton.setAttribute("aria-label", liked ? "Unlike video" : "Like video");
  }, (error) => console.error("Could not load likes:", error));
  const unsubscribeComments = onSnapshot(commentsRef, (snapshot) => {
    if (!card.isConnected) return;
    card.querySelector('[data-action="comments"] span').textContent = formatCount(snapshot.size);
  }, (error) => console.error("Could not load comment count:", error));
  cardUnsubscribes.push(unsubscribeLikes, unsubscribeComments);
}

async function renderFeed() {
  const sequence = ++renderSequence;
  const matchingVideos = visibleVideos();
  if (!matchingVideos.length) {
    feedObserver?.disconnect();
    cardUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    feed.innerHTML = "";
    emptyState.hidden = false;
    const emptyTitle = document.querySelector("#empty-title");
    const emptyDescription = document.querySelector("#empty-description");
    const emptyButton = document.querySelector("#empty-reset");
    if (searchInput.value.trim()) {
      emptyTitle.textContent = "No videos match that search";
      emptyDescription.textContent = "Try another name or clear your search.";
      emptyButton.textContent = "Clear search";
    } else if (activeFeed === "Following" && videos.length) {
      emptyTitle.textContent = "Your following feed is quiet";
      emptyDescription.textContent = "Follow a creator from the feed and their new videos will show up here.";
      emptyButton.textContent = "Back to For you";
    } else if (!videos.length && !isFirebaseConfigured) {
      emptyTitle.textContent = "Your community is waiting";
      emptyDescription.textContent = "Connect Firebase to create accounts and share videos with other people.";
      emptyButton.textContent = "Set up Firebase";
    } else {
      emptyTitle.textContent = "No videos just yet";
      emptyDescription.textContent = "Be the first to share a video with the SAINT community.";
      emptyButton.textContent = currentUser ? "Upload your first video" : "Sign in to share a video";
    }
    return;
  }
  const resolvedVideos = await Promise.all(matchingVideos.map(async (video) => {
    if (!videoUrls.has(video.storagePath)) {
      try {
        videoUrls.set(video.storagePath, await getDownloadURL(ref(storage, video.storagePath)));
      } catch (error) {
        console.error("Could not load video:", error);
        return null;
      }
    }
    return video;
  }));
  if (sequence !== renderSequence) return;
  const playableVideos = resolvedVideos.filter(Boolean);
  feedObserver?.disconnect();
  cardUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
  feed.innerHTML = playableVideos.map(cardTemplate).join("");
  emptyState.hidden = videos.length > 0;
  if (!playableVideos.length && videos.length) {
    emptyState.hidden = false;
    document.querySelector("#empty-title").textContent = "Videos couldn’t load";
    document.querySelector("#empty-description").textContent = "Check your Firebase Storage setup and try again.";
  } else {
    document.querySelector("#empty-title").textContent = activeFeed === "Following" ? "Your following feed is quiet" : "No videos just yet";
    document.querySelector("#empty-description").textContent = activeFeed === "Following"
      ? "Follow a creator from the feed and their new videos will show up here."
      : "Be the first to share a video with the SAINT community.";
  }
  setupVideoPlayback();
  feed.querySelectorAll(".video-card").forEach((card) => {
    const video = playableVideos.find((item) => item.id === card.dataset.videoId);
    if (video) updateCardStats(video, card);
  });
  renderCreators();
}

function setupVideoPlayback() {
  const cards = [...feed.querySelectorAll(".video-card")];
  if (!("IntersectionObserver" in window)) {
    cards[0]?.querySelector("video")?.play().catch(() => {});
    return;
  }
  feedObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector("video");
      if (!video) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
        video.play().then(() => entry.target.classList.remove("is-paused")).catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { root: feed, threshold: [0, 0.65, 1] });
  cards.forEach((card) => feedObserver.observe(card));
}

function startFeed() {
  feedUnsubscribe?.();
  if (!isFirebaseConfigured) {
    setBanner("Connect your Firebase project to load the shared video feed. Follow SETUP.md to get started.");
    renderFeed();
    return;
  }
  setBanner("");
  feedUnsubscribe = onSnapshot(
    query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(24)),
    (snapshot) => {
      videos = snapshot.docs.map((videoDoc) => ({ id: videoDoc.id, ...videoDoc.data() }));
      renderFeed();
      renderCreators();
    },
    (error) => {
      console.error("Could not load the video feed:", error);
      setBanner(`Couldn’t load the video feed: ${firebaseError(error)}`);
    },
  );
}

function stopUserSubscriptions() {
  followingUnsubscribe?.();
  followingCountUnsubscribe?.();
  userVideosUnsubscribe?.();
  followingUnsubscribe = null;
  followingCountUnsubscribe = null;
  userVideosUnsubscribe = null;
  followedIds = new Set();
}

function startUserSubscriptions(user) {
  stopUserSubscriptions();
  if (!user || !db) {
    renderProfile();
    renderFeed();
    renderCreators();
    return;
  }
  followingUnsubscribe = onSnapshot(collection(db, "users", user.uid, "following"), (snapshot) => {
    followedIds = new Set(snapshot.docs.map((item) => item.id));
    document.querySelector("#following-count").textContent = String(followedIds.size);
    renderCreators();
    renderFeed();
  }, (error) => {
    console.error("Could not load followed creators:", error);
    setBanner(firebaseError(error));
  });
  userVideosUnsubscribe = onSnapshot(query(collection(db, "videos"), where("authorId", "==", user.uid)), (snapshot) => {
    document.querySelector("#video-count").textContent = String(snapshot.size);
  }, (error) => console.error("Could not load your video count:", error));
}

function setFeed(name) {
  activeFeed = name;
  document.querySelectorAll("[data-feed]").forEach((tab) => {
    const selected = tab.dataset.feed === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".nav-link, .mobile-nav-link").forEach((link) => {
    const selected = link.dataset.nav === name;
    link.classList.toggle("is-active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  feed.scrollTop = 0;
  renderFeed();
}

function renderComments(snapshot) {
  if (snapshot.empty) {
    commentList.innerHTML = '<p class="comment-empty">Be the first to leave a little love ✿</p>';
    return;
  }
  commentList.innerHTML = snapshot.docs.map((commentDoc) => {
    const comment = commentDoc.data();
    return `<div class="comment-item"><div class="avatar ${comment.authorId === currentUser?.uid ? "avatar-you" : ""}">${escapeHtml(initials(comment.authorName))}</div>
      <div class="comment-copy"><strong>${escapeHtml(comment.authorName)}</strong><span>${escapeHtml(comment.text)}</span><small>${comment.createdAt?.toDate().toLocaleDateString() || "Just now"} · ♡</small></div>
    </div>`;
  }).join("");
  commentList.scrollTop = commentList.scrollHeight;
}

function openComments(video) {
  activeCommentVideo = video;
  document.querySelector("#comments-title").textContent = "Little love notes";
  commentList.innerHTML = '<p class="comment-empty">Loading the conversation…</p>';
  commentInput.disabled = !currentUser;
  commentInput.placeholder = currentUser ? "Add a little love..." : "Sign in to leave a little love...";
  commentsDialog.showModal();
  commentsUnsubscribe?.();
  commentsUnsubscribe = onSnapshot(
    query(collection(db, "videos", video.id, "comments"), orderBy("createdAt", "asc"), limit(100)),
    renderComments,
    (error) => {
      console.error("Could not load comments:", error);
      commentList.innerHTML = `<p class="comment-empty">${escapeHtml(firebaseError(error))}</p>`;
    },
  );
}

async function toggleFollow(authorId) {
  if (!requireUser()) return;
  if (authorId === currentUser.uid) return;
  const followRef = doc(db, "users", currentUser.uid, "following", authorId);
  try {
    if (followedIds.has(authorId)) {
      await deleteDoc(followRef);
      showToast("You unfollowed this creator.");
    } else {
      await setDoc(followRef, { createdAt: serverTimestamp() });
      showToast("You’re following this creator ✿");
    }
  } catch (error) {
    showToast(firebaseError(error));
    console.error("Could not update follow:", error);
  }
}

function bindCardActions() {
  feed.addEventListener("click", async (event) => {
    const card = event.target.closest(".video-card");
    if (!card) return;
    const video = videos.find((item) => item.id === card.dataset.videoId);
    if (!video) return;
    const button = event.target.closest("[data-action]");
    if (button) {
      const action = button.dataset.action;
      if (action === "like") {
        if (!requireUser()) return;
        const likeRef = doc(db, "videos", video.id, "likes", currentUser.uid);
        try {
          if (button.classList.contains("is-liked")) await deleteDoc(likeRef);
          else await setDoc(likeRef, { createdAt: serverTimestamp() });
        } catch (error) {
          showToast(firebaseError(error));
          console.error("Could not update like:", error);
        }
      } else if (action === "follow") {
        await toggleFollow(video.authorId);
      } else if (action === "comments") {
        openComments(video);
      } else if (action === "share") {
        const shareUrl = `${location.href.split("#")[0]}#${video.id}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast("Video link copied — send it to someone you love.");
        } catch (error) {
          console.error("Could not copy video link:", error);
          showToast(shareUrl);
        }
      } else if (action === "mute") {
        const player = card.querySelector("video");
        if (!player) return;
        player.muted = !player.muted;
        button.innerHTML = player.muted ? icons.muted : icons.volume;
        button.setAttribute("aria-label", player.muted ? "Turn sound on" : "Mute video");
      }
      return;
    }
    if (event.target.closest(".video-details")) return;
    const player = card.querySelector("video");
    if (!player) return;
    if (player.paused) {
      player.play().then(() => card.classList.remove("is-paused")).catch(() => {});
    } else {
      player.pause();
      card.classList.add("is-paused");
    }
  });

  feed.addEventListener("dblclick", async (event) => {
    const card = event.target.closest(".video-card");
    if (!card || event.target.closest("button")) return;
    if (!requireUser()) return;
    const video = videos.find((item) => item.id === card.dataset.videoId);
    const likeRef = doc(db, "videos", video.id, "likes", currentUser.uid);
    try {
      await setDoc(likeRef, { createdAt: serverTimestamp() });
    } catch (error) {
      showToast(firebaseError(error));
      console.error("Could not like video:", error);
    }
  });
}

function uploadFile(file, storageRef) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on("state_changed", (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      document.querySelector("#upload-progress").value = percent;
      document.querySelector("#upload-progress-label").textContent = `Uploading your video… ${percent}%`;
    }, reject, () => resolve(task.snapshot));
  });
}

function getFriendlyUploadName(file) {
  return file.name.replace(/[^\w.-]+/g, "-").slice(-100) || "video";
}

function bindEvents() {
  bindCardActions();
  document.querySelectorAll("[data-feed]").forEach((tab) => tab.addEventListener("click", () => setFeed(tab.dataset.feed)));
  document.querySelectorAll(".nav-link, .mobile-nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      const name = link.dataset.nav;
      if (name === "Following" || name === "For you") setFeed(name);
      else if (name === "Discover") {
        setFeed("For you");
        searchBox.classList.add("is-open");
        searchInput.focus();
      } else if (name === "Profile") openAccount();
      else if (name === "Inbox") showToast("Messaging is coming soon.");
      else if (name === "LIVE") showToast("Live video is coming soon.");
    });
  });

  searchInput.addEventListener("input", renderFeed);
  document.querySelector("#search-toggle").addEventListener("click", () => {
    searchBox.classList.toggle("is-open");
    if (searchBox.classList.contains("is-open")) searchInput.focus();
    else { searchInput.value = ""; renderFeed(); }
  });
  document.querySelector("#empty-reset").addEventListener("click", () => {
    if (!isFirebaseConfigured) {
      window.open("SETUP.md", "_blank", "noopener");
      return;
    }
    if (activeFeed === "Following" && videos.length) {
      setFeed("For you");
      return;
    }
    if (searchInput.value.trim()) {
      searchInput.value = "";
      renderFeed();
      return;
    }
    if (!requireUser()) return;
    document.querySelector("#upload-trigger").click();
  });
  document.querySelector("#creator-list").addEventListener("click", (event) => {
    const button = event.target.closest(".follow-mini");
    if (button) toggleFollow(button.dataset.creator);
  });
  document.querySelector("#see-all-creators").addEventListener("click", () => setFeed("Following"));
  document.querySelector("#feed-tip-upload").addEventListener("click", () => {
    if (!requireUser()) return;
    document.querySelector("#upload-trigger").click();
  });
  document.querySelectorAll("#account-trigger, #toolbar-account").forEach((button) => button.addEventListener("click", openAccount));
  document.querySelector("#account-switch").addEventListener("click", () => {
    setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
  });
  document.querySelector("#sign-out-button").addEventListener("click", async () => {
    try {
      await signOut(auth);
      accountDialog.close();
      showToast("You’ve signed out.");
    } catch (error) {
      showToast(firebaseError(error));
    }
  });
  document.querySelector("#reset-password").addEventListener("click", async () => {
    const email = document.querySelector("#email-input").value.trim();
    if (!email) {
      document.querySelector("#auth-error").textContent = "Enter your email address first.";
      document.querySelector("#auth-error").hidden = false;
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      document.querySelector("#auth-error").textContent = "Password reset email sent. Check your inbox.";
      document.querySelector("#auth-error").hidden = false;
    } catch (error) {
      document.querySelector("#auth-error").textContent = firebaseError(error);
      document.querySelector("#auth-error").hidden = false;
    }
  });
  document.querySelector("#account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submittedMode = authMode;
    const errorElement = document.querySelector("#auth-error");
    errorElement.hidden = true;
    const email = document.querySelector("#email-input").value.trim();
    const password = document.querySelector("#password-input").value;
    const displayName = document.querySelector("#display-name-input").value.trim();
    const submit = document.querySelector("#account-submit");
    submit.disabled = true;
    submit.textContent = authMode === "sign-up" ? "Creating your account…" : "Signing in…";
    try {
      if (authMode === "sign-up") {
        if (displayName.length < 2) throw new Error("Please enter a name with at least 2 characters.");
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credentials.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      accountDialog.close();
      event.target.reset();
      setAuthMode("sign-in");
      showToast(submittedMode === "sign-up" ? "Welcome to SAINT ✿" : "Welcome back.");
    } catch (error) {
      errorElement.textContent = firebaseError(error);
      errorElement.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = authMode === "sign-up" ? "Create account" : "Sign in";
    }
  });

  document.querySelectorAll("#upload-trigger, #mobile-upload").forEach((button) => button.addEventListener("click", () => {
    if (!requireUser()) return;
    document.querySelector("#upload-error").hidden = true;
    videoUpload.value = "";
    document.querySelector("#caption-input").value = "";
    document.querySelector("#upload-file-name").textContent = "Choose a video to share";
    document.querySelector("#upload-progress-wrap").hidden = true;
    uploadDialog.showModal();
  }));
  videoUpload.addEventListener("change", () => {
    document.querySelector("#upload-file-name").textContent = videoUpload.files[0]?.name || "Choose a video to share";
  });
  document.querySelector("#upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireUser()) return;
    const file = videoUpload.files[0];
    const errorElement = document.querySelector("#upload-error");
    const publishButton = document.querySelector("#publish-button");
    errorElement.hidden = true;
    if (!file || !file.type.startsWith("video/")) {
      errorElement.textContent = "Choose a video file before posting.";
      errorElement.hidden = false;
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      errorElement.textContent = "This video is over the 100 MB upload limit.";
      errorElement.hidden = false;
      return;
    }
    const storagePath = `videos/${currentUser.uid}/${crypto.randomUUID()}-${getFriendlyUploadName(file)}`;
    const mediaRef = ref(storage, storagePath);
    const displayName = currentUser.displayName || currentUser.email.split("@")[0];
    const caption = document.querySelector("#caption-input").value.trim();
    publishButton.disabled = true;
    publishButton.textContent = "Uploading…";
    document.querySelector("#upload-progress-wrap").hidden = false;
    document.querySelector("#upload-progress").value = 0;
    try {
      await uploadFile(file, mediaRef);
      try {
        const videoDoc = await addDoc(collection(db, "videos"), {
          authorId: currentUser.uid,
          authorName: displayName,
          authorHandle: handleFor(currentUser),
          caption,
          storagePath,
          createdAt: serverTimestamp(),
        });
        videoUrls.delete(storagePath);
        uploadDialog.close();
        feed.scrollTop = 0;
        showToast("Your video is live on SAINT ✿");
        location.hash = videoDoc.id;
      } catch (error) {
        await deleteObject(mediaRef).catch((cleanupError) => console.error("Could not remove unpublished video:", cleanupError));
        throw error;
      }
    } catch (error) {
      errorElement.textContent = firebaseError(error);
      errorElement.hidden = false;
      console.error("Could not upload video:", error);
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = "Post video";
    }
  });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireUser() || !activeCommentVideo) return;
    const text = commentInput.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "videos", activeCommentVideo.id, "comments"), {
        authorId: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email.split("@")[0],
        text,
        createdAt: serverTimestamp(),
      });
      commentInput.value = "";
    } catch (error) {
      showToast(firebaseError(error));
      console.error("Could not post comment:", error);
    }
  });

  document.querySelector("#feedback-button").addEventListener("click", () => showToast("Thanks for helping us make SAINT better ✿"));
  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  commentsDialog.addEventListener("close", () => {
    commentsUnsubscribe?.();
    commentsUnsubscribe = null;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      searchBox.classList.add("is-open");
      searchInput.focus();
    }
    if (event.key === "Escape" && searchBox.classList.contains("is-open") && window.innerWidth <= 760) {
      searchBox.classList.remove("is-open");
      searchInput.value = "";
      renderFeed();
    }
  });
}

function initialize() {
  bindEvents();
  renderProfile();
  if (!isFirebaseConfigured) {
    startFeed();
    return;
  }
  startFeed();
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderProfile();
    startUserSubscriptions(user);
    document.querySelector("#signed-out-panel").hidden = Boolean(user);
    document.querySelector("#signed-in-panel").hidden = !user;
  }, (error) => {
    console.error("Firebase sign-in state could not be loaded:", error);
    setBanner(firebaseError(error));
  });
}

initialize();
