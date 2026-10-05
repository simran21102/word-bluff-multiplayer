import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, startGame, submitDefinition, submitVote, resolveRound, nextRound, removePlayer, publicState, resetRoom } from '../src/game.js';

const roomWithPlayers = () => {
  const room = makeRoom('ABC123', 'a', 'Ada');
  room.players.set('b', { id: 'b', name: 'Blaise', score: 0, connected: true });
  room.players.set('c', { id: 'c', name: 'Curie', score: 0, connected: true });
  return room;
};

test('starts with a secret word known only to the bluffer view', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  assert.equal(room.phase, 'bluffer');
  assert.ok(room.secretWord.word);
  assert.equal(publicState(room, 'a').secretWord, room.secretWord.word);
  assert.equal(publicState(room, 'b').secretWord, null);
});

test('collects real and fake definitions, then opens voting', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  submitDefinition(room, 'a', 'The real dictionary meaning');
  submitDefinition(room, 'b', 'A very convincing fake');
  submitDefinition(room, 'c', 'Another convincing fake');
  assert.equal(room.phase, 'voting');
  assert.throws(() => submitDefinition(room, 'b', 'duplicate'), /already submitted/);
});

test('rejects self votes and scores correct and fake votes', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  submitDefinition(room, 'a', 'real'); submitDefinition(room, 'b', 'fake one'); submitDefinition(room, 'c', 'fake two');
  assert.throws(() => submitVote(room, 'b', 'b'), /own/);
  submitVote(room, 'a', 'b'); submitVote(room, 'b', 'a'); submitVote(room, 'c', 'a');
  resolveRound(room);
  assert.equal(room.phase, 'results');
  assert.equal(room.players.get('a').score, 0); // the bluffer is not rewarded for correct votes
  assert.equal(room.players.get('b').score, 3); // correct guess plus one vote for the fake
  assert.equal(room.players.get('c').score, 2); // correct guess
});

test('rotates bluffer and reaches final after five rounds', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  for (let round = 1; round <= 5; round += 1) {
    submitDefinition(room, room.blufferId, 'real answer');
    for (const id of room.players.keys()) if (id !== room.blufferId) submitDefinition(room, id, `fake ${round} ${id}`);
    for (const id of room.players.keys()) { const target = [...room.definitions.keys()].find(owner => owner !== id); submitVote(room, id, target); }
    resolveRound(room);
    if (round < 5) { nextRound(room, () => 0); assert.equal(room.phase, 'bluffer'); }
  }
  assert.equal(room.phase, 'final');
});

test('removing the bluffer restarts the active round with a new bluffer', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  removePlayer(room, 'a');
  assert.equal(room.phase, 'bluffer');
  assert.equal(room.players.size, 2);
  assert.ok(room.blufferId);
});

test('resets a completed room for another lobby game', () => {
  const room = roomWithPlayers(); startGame(room, () => 0);
  room.players.get('a').score = 9; room.round = 5; room.phase = 'final';
  resetRoom(room);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.round, 0);
  assert.equal(room.players.get('a').score, 0);
  assert.equal(room.blufferId, null);
});
