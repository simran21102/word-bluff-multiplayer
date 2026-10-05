export const MAX_PLAYERS = 8;
export const TOTAL_ROUNDS = 5;

export const WORDS = [
  { word: 'Petrichor', hint: 'A smell people notice after rain.' },
  { word: 'Quokka', hint: 'A cheerful-looking animal.' },
  { word: 'Serendipity', hint: 'A lucky discovery.' },
  { word: 'Limerence', hint: 'An intense feeling of infatuation.' },
  { word: 'Zephyr', hint: 'A light breeze.' },
  { word: 'Mellifluous', hint: 'Pleasant to hear.' },
  { word: 'Wanderlust', hint: 'A strong desire to travel.' },
  { word: 'Gobbledygook', hint: 'Language that is hard to understand.' }
];

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const cleanName = value => clean(value, 20);
export const cleanDefinition = value => clean(value, 280);

export function makeRoom(code, id, name) {
  return {
    code, hostId: id, phase: 'lobby', round: 0, blufferId: null,
    secretWord: null, definitions: new Map(), votes: new Map(), roundPoints: new Map(),
    usedWords: [], players: new Map([[id, { id, name, score: 0, connected: true }]])
  };
}

export function chooseWord(room, random = Math.random) {
  const available = WORDS.filter(item => !room.usedWords.includes(item.word));
  const chosen = available[Math.floor(random() * available.length) % available.length] || WORDS[0];
  room.usedWords.push(chosen.word);
  return chosen;
}

export function startGame(room, random = Math.random) {
  if (room.players.size < 2) throw new Error('At least two players are required.');
  room.round = 1;
  room.phase = 'bluffer';
  room.blufferId = [...room.players.keys()][0];
  room.secretWord = chooseWord(room, random);
  room.definitions.clear(); room.votes.clear(); room.roundPoints.clear();
  return room;
}

export function submitDefinition(room, playerId, text) {
  if (!room.players.has(playerId)) throw new Error('Player is not in this room.');
  if (room.definitions.has(playerId)) throw new Error('You already submitted a definition.');
  if (!['bluffer', 'definitions'].includes(room.phase)) throw new Error('Definitions are not being collected.');
  const definition = cleanDefinition(text);
  if (definition.length < 3) throw new Error('Definition must be at least 3 characters.');
  if (room.phase === 'bluffer' && playerId !== room.blufferId) throw new Error('Only the bluffer can submit now.');
  if (room.phase === 'definitions' && playerId === room.blufferId) throw new Error('The bluffer has already submitted.');
  room.definitions.set(playerId, definition);
  if (playerId === room.blufferId) room.phase = 'definitions';
  if (room.phase === 'definitions' && [...room.players.keys()].every(id => room.definitions.has(id))) room.phase = 'voting';
  return room;
}

export function submitVote(room, playerId, definitionOwnerId) {
  if (room.phase !== 'voting') throw new Error('Voting is not open.');
  if (!room.players.has(playerId) || !room.definitions.has(definitionOwnerId)) throw new Error('That vote is not valid.');
  if (playerId === definitionOwnerId) throw new Error('You cannot vote for your own definition.');
  if (room.votes.has(playerId)) throw new Error('You already voted.');
  room.votes.set(playerId, definitionOwnerId);
  if ([...room.players.keys()].every(id => room.votes.has(id) || id === definitionOwnerId)) {
    // The condition above is intentionally not used to finish: all players must vote.
  }
  return room;
}

export function isVotingComplete(room) {
  return room.phase === 'voting' && [...room.players.keys()].every(id => room.votes.has(id));
}

export function resolveRound(room) {
  if (!isVotingComplete(room)) throw new Error('Waiting for every player to vote.');
  const points = new Map([...room.players.keys()].map(id => [id, 0]));
  for (const [voter, owner] of room.votes) {
    if (owner === room.blufferId) points.set(voter, (points.get(voter) || 0) + 2);
    else {
      points.set(owner, (points.get(owner) || 0) + 1);
      if (voter !== room.blufferId) points.set(room.blufferId, (points.get(room.blufferId) || 0) + 1);
    }
  }
  for (const [id, value] of points) room.players.get(id).score += value;
  room.roundPoints = points;
  room.phase = room.round >= TOTAL_ROUNDS ? 'final' : 'results';
  return room;
}

export function nextRound(room, random = Math.random) {
  if (room.phase !== 'results') throw new Error('The round is not ready to advance.');
  const ids = [...room.players.keys()];
  if (ids.length < 2) { room.phase = 'lobby'; room.round = 0; return room; }
  const oldIndex = ids.indexOf(room.blufferId);
  room.blufferId = ids[(oldIndex + 1) % ids.length];
  room.round += 1; room.secretWord = chooseWord(room, random);
  room.definitions.clear(); room.votes.clear(); room.roundPoints.clear(); room.phase = 'bluffer';
  return room;
}

export function resetRoom(room) {
  room.phase = 'lobby'; room.round = 0; room.blufferId = null; room.secretWord = null;
  room.definitions.clear(); room.votes.clear(); room.roundPoints.clear(); room.usedWords = [];
  for (const player of room.players.values()) player.score = 0;
  return room;
}

export function removePlayer(room, id) {
  const wasBluffer = room.blufferId === id;
  room.players.delete(id); room.definitions.delete(id); room.votes.delete(id);
  for (const [voter, owner] of room.votes) if (owner === id) room.votes.delete(voter);
  if (room.hostId === id) room.hostId = room.players.keys().next().value || null;
  if (room.players.size < 2) { room.phase = 'lobby'; room.round = 0; room.blufferId = null; room.secretWord = null; room.definitions.clear(); room.votes.clear(); return room; }
  if (wasBluffer && ['bluffer', 'definitions', 'voting'].includes(room.phase)) {
    const ids = [...room.players.keys()];
    room.blufferId = ids[room.round ? (room.round - 1) % ids.length : 0];
    room.secretWord = chooseWord(room);
    room.definitions.clear(); room.votes.clear(); room.phase = 'bluffer';
  } else if (room.phase === 'definitions' && [...room.players.keys()].every(pid => room.definitions.has(pid))) room.phase = 'voting';
  else if (room.phase === 'voting' && isVotingComplete(room)) resolveRound(room);
  return room;
}

export function publicState(room, viewerId) {
  const player = room.players.get(viewerId);
  const definitions = [...room.definitions].map(([ownerId, text], index) => ({ id: ownerId, text, index, isOwn: ownerId === viewerId }));
  return {
    viewerId,
    code: room.code, phase: room.phase, round: room.round, totalRounds: TOTAL_ROUNDS,
    hostId: room.hostId, blufferId: room.blufferId,
    isHost: room.hostId === viewerId, isBluffer: room.blufferId === viewerId,
    secretWord: room.blufferId === viewerId && room.secretWord ? room.secretWord.word : null,
    wordHint: room.blufferId === viewerId && room.secretWord ? room.secretWord.hint : null,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })),
    definitions: room.phase === 'voting' || room.phase === 'results' || room.phase === 'final' ? definitions.map(d => ({ ...d, id: room.phase === 'voting' ? d.id : d.id })) : [],
    submittedIds: [...room.definitions.keys()], votedIds: [...room.votes.keys()],
    votes: room.phase === 'results' || room.phase === 'final' ? [...room.votes].map(([voterId, ownerId]) => ({ voterId, ownerId })) : [],
    roundPoints: [...room.roundPoints].map(([id, points]) => ({ id, points })),
    winnerId: room.phase === 'final' ? [...room.players.values()].sort((a, b) => b.score - a.score)[0]?.id : null
  };
}
