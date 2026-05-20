import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  PUZZLE_ENC_MAGIC,
  PUZZLE_ENC_VERSION,
  PUZZLE_ENC_IV_LEN,
  PUZZLE_ENC_GCM_TAG_LEN,
} from "../../js/puzzle-file-crypto.js";
import { deobfuscatePuzzleFileKey } from "../../js/puzzle-file-key.js";

const HEADER_LEN = PUZZLE_ENC_MAGIC.length + 1 + PUZZLE_ENC_IV_LEN;

function assertPuzzleEncHeader(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < HEADER_LEN + PUZZLE_ENC_GCM_TAG_LEN) {
    throw new Error("puzzles.enc: file too short");
  }
  if (bytes.toString("ascii", 0, PUZZLE_ENC_MAGIC.length) !== PUZZLE_ENC_MAGIC) {
    throw new Error("puzzles.enc: bad magic header");
  }
  if (bytes[PUZZLE_ENC_MAGIC.length] !== PUZZLE_ENC_VERSION) {
    throw new Error("puzzles.enc: unsupported version");
  }
}

/**
 * @param {string} plaintext
 * @param {Buffer} [key32]
 * @returns {Buffer}
 */
export function encryptPuzzleFilePlaintextSync(
  plaintext,
  key32 = Buffer.from(deobfuscatePuzzleFileKey())
) {
  const iv = randomBytes(PUZZLE_ENC_IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key32, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from(PUZZLE_ENC_MAGIC, "ascii"),
    Buffer.from([PUZZLE_ENC_VERSION]),
    iv,
    enc,
    tag,
  ]);
}

/**
 * @param {Buffer} fileBytes
 * @param {Buffer} [key32]
 * @returns {string}
 */
export function decryptPuzzleFileBytesSync(
  fileBytes,
  key32 = Buffer.from(deobfuscatePuzzleFileKey())
) {
  assertPuzzleEncHeader(fileBytes);
  const ivStart = PUZZLE_ENC_MAGIC.length + 1;
  const iv = fileBytes.subarray(ivStart, ivStart + PUZZLE_ENC_IV_LEN);
  const body = fileBytes.subarray(ivStart + PUZZLE_ENC_IV_LEN);
  const tag = body.subarray(body.length - PUZZLE_ENC_GCM_TAG_LEN);
  const ciphertext = body.subarray(0, body.length - PUZZLE_ENC_GCM_TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}

/** @param {Buffer} fileBytes @returns {string} */
export function encodePuzzleEncFileBase64(fileBytes) {
  return fileBytes.toString("base64");
}

/** @param {string} b64 @returns {Buffer} */
export function decodePuzzleEncFileBase64(b64) {
  return Buffer.from(String(b64 || "").replace(/\s+/g, ""), "base64");
}
