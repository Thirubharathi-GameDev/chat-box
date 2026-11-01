import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
