import { getApiUrl } from './config';

export async function api(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, { method, headers, body: payload });
  } catch {
    throw new Error('Can’t reach the server. Use the same Wi-Fi and check that it is running.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

export async function uploadProfilePhoto(token, uri) {
  const name = uri.split('/').pop()?.split('?')[0] || 'profile.jpg';
  const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const form = new FormData();
  form.append('file', { uri, name, type });
  return api('/api/me/photo', { token, method: 'POST', form });
}

async function uploadThroughServer(token, uri, kind) {
  const name = uri.split('/').pop()?.split('?')[0] || (kind === 'image' ? 'photo.jpg' : 'voice.m4a');
  const type = kind === 'image' ? (name.endsWith('.png') ? 'image/png' : 'image/jpeg') : 'audio/mp4';
  const form = new FormData();
  form.append('file', { uri, name, type });
  return api('/api/media', { token, method: 'POST', form });
}

async function uploadVoiceDirect(token, uri) {
  const signed = await api('/api/media/sign', { token, method: 'POST', body: { kind: 'voice' } });
  const form = new FormData();
  form.append('file', { uri, name: 'voice.m4a', type: 'audio/mp4' });
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signed.cloudName}/${signed.resourceType}/upload`,
    { method: 'POST', body: form }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || 'Upload failed');
  }
  return { url: data.secure_url, kind: 'voice' };
}

export async function uploadMedia(token, uri, kind) {
  if (kind === 'voice') {
    try {
      return await uploadVoiceDirect(token, uri);
    } catch {
      return uploadThroughServer(token, uri, kind);
    }
  }
  return uploadThroughServer(token, uri, kind);
}
