import { deobfuscatePuzzleFileKey } from "./puzzle-file-key.js";

export const PUZZLE_ENC_MAGIC = "WHENC1";
export const PUZZLE_ENC_VERSION = 1;
export const PUZZLE_ENC_IV_LEN = 12;
export const PUZZLE_ENC_GCM_TAG_LEN = 16;

const HEADER_LEN = PUZZLE_ENC_MAGIC.length + 1 + PUZZLE_ENC_IV_LEN;

function assertPuzzleEncHeader(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < HEADER_LEN + PUZZLE_ENC_GCM_TAG_LEN
  ) {
    throw new Error("puzzles.enc: file too short");
  }
  const magic = String.fromCharCode(...bytes.slice(0, PUZZLE_ENC_MAGIC.length));
  if (magic !== PUZZLE_ENC_MAGIC) {
    throw new Error("puzzles.enc: bad magic header");
  }
  if (bytes[PUZZLE_ENC_MAGIC.length] !== PUZZLE_ENC_VERSION) {
    throw new Error("puzzles.enc: unsupported version");
  }
}

/**
 * @param {Uint8Array} plainBytes
 * @param {Uint8Array} key32
 * @param {Uint8Array} iv12
 * @returns {Promise<Uint8Array>} ciphertext with GCM tag appended
 */
export async function encryptPuzzleFileBytesWithKey(plainBytes, key32, iv12) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key32,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv12, tagLength: PUZZLE_ENC_GCM_TAG_LEN * 8 },
    cryptoKey,
    plainBytes
  );
  return new Uint8Array(cipherBuf);
}

/**
 * @param {string} plaintext UTF-8 puzzle file body
 * @param {Uint8Array} [key32] defaults to deobfuscated embedded key
 * @returns {Promise<Uint8Array>} full file blob (header + IV + ciphertext)
 */
export async function encryptPuzzleFilePlaintext(
  plaintext,
  key32 = deobfuscatePuzzleFileKey()
) {
  const iv = crypto.getRandomValues(new Uint8Array(PUZZLE_ENC_IV_LEN));
  const plainBytes = new TextEncoder().encode(plaintext);
  const cipherWithTag = await encryptPuzzleFileBytesWithKey(plainBytes, key32, iv);
  const out = new Uint8Array(
    PUZZLE_ENC_MAGIC.length + 1 + PUZZLE_ENC_IV_LEN + cipherWithTag.length
  );
  let o = 0;
  for (let i = 0; i < PUZZLE_ENC_MAGIC.length; i++)
    out[o++] = PUZZLE_ENC_MAGIC.charCodeAt(i);
  out[o++] = PUZZLE_ENC_VERSION;
  out.set(iv, o);
  o += PUZZLE_ENC_IV_LEN;
  out.set(cipherWithTag, o);
  return out;
}

/**
 * @param {Uint8Array} fileBytes full puzzles.enc blob
 * @param {Uint8Array} [key32] defaults to deobfuscated embedded key
 * @returns {Promise<string>} decrypted UTF-8 plaintext
 */
export async function decryptPuzzleFileBytes(
  fileBytes,
  key32 = deobfuscatePuzzleFileKey()
) {
  assertPuzzleEncHeader(fileBytes);
  const ivStart = PUZZLE_ENC_MAGIC.length + 1;
  const iv = fileBytes.slice(ivStart, ivStart + PUZZLE_ENC_IV_LEN);
  const cipherWithTag = fileBytes.slice(ivStart + PUZZLE_ENC_IV_LEN);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key32,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: PUZZLE_ENC_GCM_TAG_LEN * 8 },
    cryptoKey,
    cipherWithTag
  );
  return new TextDecoder().decode(plainBuf);
}

/** @param {Uint8Array} fileBytes @returns {string} base64 for committed puzzles.enc */
export function encodePuzzleEncFileBase64(fileBytes) {
  let bin = "";
  for (let i = 0; i < fileBytes.length; i++) bin += String.fromCharCode(fileBytes[i]);
  return btoa(bin);
}

/** @param {string} b64 @returns {Uint8Array} */
export function decodePuzzleEncFileBase64(b64) {
  const bin = atob(String(b64 || "").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
