import { createMultiplayerServer } from './room-server.js';

const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const origins = process.env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean);
const server = createMultiplayerServer({
  ...(origins ? { allowedOrigins: origins } : {}),
  onError: () => console.error('A multiplayer request failed. No player tokens were logged.'),
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Wizzy multiplayer is listening on port ${port}.`);
  console.log(`Local computer: http://localhost:${port}/`);
  console.log(`Other devices on this Wi-Fi: http://YOUR_COMPUTER_LAN_IP:${port}/`);
  console.log('Build the app with npm run build:web first. Rooms are held in memory and end when this process restarts.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
