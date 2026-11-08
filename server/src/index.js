import 'dotenv/config';
import { connectDb } from './db.js';
import { createServer } from './app.js';
import { initFirebase } from './services/push.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set.');
  process.exit(1);
}

initFirebase();

try {
  await connectDb();
} catch (err) {
  console.error('MongoDB connection failed.', err.message);
  process.exit(1);
}

const { server } = createServer();
const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0', () => {
  console.log(`Chat server listening on 0.0.0.0:${port}`);
});
