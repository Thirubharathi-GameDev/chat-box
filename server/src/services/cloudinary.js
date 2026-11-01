import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../errors.js';

let configured = false;

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function ensureConfig() {
  if (!isCloudinaryConfigured()) {
    throw new HttpError(503, 'Photo and voice uploads are not configured yet.');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
}

export function uploadBuffer(buffer, { folder, resourceType }) {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error('Upload failed'));
          return;
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}
