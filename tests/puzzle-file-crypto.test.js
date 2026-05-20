import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptPuzzleFilePlaintextSync,
  decryptPuzzleFileBytesSync,
  encodePuzzleEncFileBase64,
  decodePuzzleEncFileBase64,
} from "../scripts/lib/puzzle-file-crypto.mjs";

test("puzzle file crypto roundtrip", () => {
  const plain = '{"starting_grid":[["a"]]}\n{"starting_grid":[["b"]]}\n';
  const blob = encryptPuzzleFilePlaintextSync(plain);
  const b64 = encodePuzzleEncFileBase64(blob);
  const back = decryptPuzzleFileBytesSync(decodePuzzleEncFileBase64(b64));
  assert.equal(back, plain);
});
