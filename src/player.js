import { crazy } from './crazygames.js';

const GUEST_ID_KEY = 'qube2048.guestId';

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Logged in CrazyGames users are keyed by their account id, guests by an id saved on this device. */
export async function loadPlayer() {
  const user = await crazy.getUser();
  if (user) return { id: 'cg:' + user.__dangerousUserId, name: user.username, guest: false };

  let id = crazy.storage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = randomId();
    crazy.storage.setItem(GUEST_ID_KEY, id);
  }
  return { id: 'guest:' + id, name: 'Guest_' + id.replace(/-/g, '').slice(0, 5).toUpperCase(), guest: true };
}
