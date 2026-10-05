import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { cleanName, makeRoom, MAX_PLAYERS, nextRound, publicState, removePlayer, resolveRound, resetRoom, startGame, submitDefinition, submitVote, isVotingComplete } from './game.js';

const app = express();
const server = http.createServer(app);
const clientUrl = process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: clientUrl }));
app.get('/health', (_req, res) => res.json({ ok: true }));
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(dist));
app.get('*', (_req, res, next) => { if (_req.path.startsWith('/socket.io')) return next(); res.sendFile(path.join(dist, 'index.html'), err => err && res.status(404).json({ error: 'Not found' })); });

const io = new Server(server, { cors: { origin: clientUrl, methods: ['GET', 'POST'] } });
const rooms = new Map();
const socketRooms = new Map();
const code = () => { let value; do value = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms.has(value)); return value; };
const error = (socket, message) => socket.emit('game:error', message);
const broadcast = room => { for (const id of room.players.keys()) io.to(id).emit('game:state', publicState(room, id)); };
function leaveSocket(socket, remove = true) {
  const codeValue = socketRooms.get(socket.id); if (!codeValue) return;
  const room = rooms.get(codeValue); socketRooms.delete(socket.id); socket.leave(codeValue);
  if (room && remove) { removePlayer(room, socket.id); if (room.players.size === 0) rooms.delete(codeValue); else broadcast(room); }
}

io.on('connection', socket => {
  socket.on('room:create', ({ name } = {}) => {
    const playerName = cleanName(name); if (playerName.length < 2) return error(socket, 'Name must be at least 2 characters.');
    const room = makeRoom(code(), socket.id, playerName); rooms.set(room.code, room); socketRooms.set(socket.id, room.code); socket.join(room.code); broadcast(room);
  });
  socket.on('room:join', ({ name, code: rawCode } = {}) => {
    const room = rooms.get(String(rawCode || '').trim().toUpperCase()); const playerName = cleanName(name);
    if (!room) return error(socket, 'Room not found. Check the code and try again.');
    if (room.phase !== 'lobby') return error(socket, 'This game has already started.');
    if (room.players.size >= MAX_PLAYERS) return error(socket, 'This room is full.');
    if (playerName.length < 2) return error(socket, 'Name must be at least 2 characters.');
    if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) return error(socket, 'That name is already in use.');
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, connected: true }); socketRooms.set(socket.id, room.code); socket.join(room.code); broadcast(room);
  });
  socket.on('game:start', () => { const room = rooms.get(socketRooms.get(socket.id)); if (!room || room.hostId !== socket.id) return error(socket, 'Only the host can start.'); try { startGame(room); broadcast(room); } catch (e) { error(socket, e.message); } });
  socket.on('game:definition', text => { const room = rooms.get(socketRooms.get(socket.id)); if (!room) return; try { submitDefinition(room, socket.id, text); broadcast(room); } catch (e) { error(socket, e.message); } });
  socket.on('game:vote', ownerId => { const room = rooms.get(socketRooms.get(socket.id)); if (!room) return; try { submitVote(room, socket.id, ownerId); if (isVotingComplete(room)) resolveRound(room); broadcast(room); } catch (e) { error(socket, e.message); } });
  socket.on('game:next', () => { const room = rooms.get(socketRooms.get(socket.id)); if (!room || room.hostId !== socket.id) return error(socket, 'Only the host can continue.'); try { nextRound(room); broadcast(room); } catch (e) { error(socket, e.message); } });
  socket.on('game:reset', () => { const room = rooms.get(socketRooms.get(socket.id)); if (!room || room.hostId !== socket.id) return error(socket, 'Only the host can start a new game.'); resetRoom(room); broadcast(room); });
  socket.on('room:leave', () => leaveSocket(socket));
  socket.on('disconnect', () => leaveSocket(socket));
});

const port = Number(process.env.PORT || 3001);
server.listen(port, '0.0.0.0', () => console.log(`Word Bluff server listening on ${port}`));
