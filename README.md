# Chatbox

A one-to-one chat for Expo Go. Each person can connect with only one other person. The phone app is in `app`. The API and Socket.io server are in `server`.

## What it does

1. Register and log in with a user ID and password.
2. Enter a display name. That is the only profile field.
3. Tap **+**. The popup shows your code and a box for the other person’s code.
4. When the code is entered, those two accounts are linked and stored in MongoDB. A third person cannot join that pair.
5. The chat keeps history and can send text (including emoji), photos, and voice messages.

Photos and voice notes are uploaded through the server to Cloudinary. MongoDB stores the URL, not the file. If the other person has no open socket, the server sends a Firebase push.

## Run the server

Node.js 20 or newer is enough for the server. Copy the env file and fill it in:

```bash
cd server
copy .env.example .env
npm install
npm run dev
```

Required in `server/.env`:

- `MONGODB_URI` — local MongoDB or Atlas
- `JWT_SECRET` — a long random string
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — needed before photos or voice notes can send
- `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_JSON` — needed before push notifications send

The API listens on port `4000`.

## Run the app

This Expo SDK needs **Node.js 22.13 or newer**. Install it, then:

```bash
cd app
npm install
npx expo start
```

Open the project in Expo Go on a phone that is on the same Wi-Fi as the computer. Leave `EXPO_PUBLIC_API_URL` unset and the app uses that computer’s address on port `4000`. Set `EXPO_PUBLIC_API_URL` in `app/.env` only when the server is on another machine. Do not use `localhost` on a physical phone.

## Push notifications

The app asks for notification permission and registers a device token. The server sends with Firebase Admin when the token is a Firebase device token. Expo push tokens are forwarded to Expo’s push service.

Remote pushes do not arrive inside Expo Go. Login, pairing, chat, history, photos, and voice still work there. A development build (`npx expo run:android`) is required before a phone can receive Firebase pushes. Chat history does not depend on push; it reloads from MongoDB.

Pairing is permanent in this version. There is no unpair.
