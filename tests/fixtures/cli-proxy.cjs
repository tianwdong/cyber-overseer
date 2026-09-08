// Test-only byte proxy, never launches Codex or reads its profile.
const net=require('node:net');
const socket=net.connect(Number(process.argv[2]),'127.0.0.1');
process.stdin.pipe(socket);socket.pipe(process.stdout);
socket.on('error',()=>process.exit(1));socket.on('close',()=>process.exit(0));
