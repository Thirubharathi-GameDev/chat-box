import { HttpError } from './errors.js';

const USER_ID = /^[a-zA-Z0-9_]{3,20}$/;

export function assertUserId(value) {
  if (typeof value !== 'string' || !USER_ID.test(value.trim())) {
    throw new HttpError(400, 'User ID must be 3–20 characters: letters, numbers, or underscore.');
  }
  return value.trim().toLowerCase();
}

export function assertPassword(value) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 72) {
    throw new HttpError(400, 'Password must be 6–72 characters.');
  }
  return value;
}

export function assertDisplayName(value) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Enter your name.');
  }
  const name = value.trim();
  if (name.length < 1 || name.length > 40) {
    throw new HttpError(400, 'Name must be 1–40 characters.');
  }
  return name;
}
