import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDataset } from './serve-dataset.js';

function fixture() {
  const files = { results: 'versions/one/results.json', voteCount: 'versions/one/count.json', electorateDetails: 'versions/one/details.json', electorateWinners: 'versions/one/winners.json', partyVoteSnapshots: 'versions/one/history.json' };
  const history = { snapshots: [{ totalVotesCast: 100 }, { totalVotesCast: 200 }] };
  const objects = new Map(Object.values(files).map((path) => [path, {}]));
  objects.set(files.partyVoteSnapshots, history);
  objects.set('latest.json', { version: 'one', files });
  const reads = [];
  const env = { RESULTS_BUCKET: { async get(key) {
    reads.push(key);
    return objects.has(key) ? { json: async () => structuredClone(objects.get(key)) } : null;
  } } };
  return { env, reads, history, objects };
}

test('fresh requests return full stored history without modifying storage', async () => {
  const { env, history, reads } = fixture();
  for (let reload = 0; reload < 2; reload++) {
    const response = await serveDataset(new Request('https://example/results/dataset'), env);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data.partyVoteSnapshots, history);
    assert.equal(data.latest.version, 'one');
  }
  assert.equal(reads.filter((key) => key === 'latest.json').length, 2);
});

test('missing publication reports unavailable instead of creating new history', async () => {
  const { env, objects } = fixture();
  objects.delete('latest.json');
  assert.equal((await serveDataset(new Request('https://example/results/dataset'), env)).status, 503);
});

test('all result files use the single captured manifest', async () => {
  const { env, reads } = fixture();
  await serveDataset(new Request('https://example/results/dataset'), env);
  assert.equal(reads.filter((key) => key === 'latest.json').length, 1);
  assert.equal(reads.filter((key) => key.startsWith('versions/one/')).length, 5);
});
