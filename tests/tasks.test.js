import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, DEMO_TOKEN } from '../demo/server.js';
let server, baseURL;
// A new service and an OS-assigned port keep every test independent of prior state.
beforeEach(async () => {
  server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
// Close keep-alive connections before the server so the test process can exit promptly.
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
// raw lets negative tests send malformed JSON; token=null deliberately omits authentication.
const call = (path, { method = 'GET', body, token = DEMO_TOKEN, raw, contentType = 'application/json' } = {}) =>
  fetch(baseURL + path, { method, headers: { ...(token === null ? {} : { Authorization: `Bearer ${token}` }), 'Content-Type': contentType }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
// Check field shape and types, not just a successful HTTP status.
function assertTask(task) {
  assert.deepEqual(Object.keys(task).sort(), ['completed', 'id', 'title']);
  assert.ok(Number.isSafeInteger(task.id) && task.id > 0);
  assert.equal(typeof task.title, 'string');
  assert.equal(typeof task.completed, 'boolean');
}
async function create(title = 'Read a chapter') {
  const response = await call('/tasks', { method: 'POST', body: { title } });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const task = await response.json(); assertTask(task);
  assert.equal(response.headers.get('location'), `/tasks/${task.id}`);
  return task;
}

// Read back after writes and confirm deletion so success cannot be a status-code-only illusion.
test('complete CRUD lifecycle with contract and persisted-state assertions', async () => {
  const task = await create();
  const read = await call(`/tasks/${task.id}`);
  assert.equal(read.status, 200); assert.deepEqual(await read.json(), task);
  const update = await call(`/tasks/${task.id}`, { method: 'PATCH', body: { completed: true } });
  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), { ...task, completed: true });
  const list = await call('/tasks');
  assert.equal(list.status, 200); assert.deepEqual(await list.json(), [{ ...task, completed: true }]);
  const deleted = await call(`/tasks/${task.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204); assert.equal(await deleted.text(), '');
  assert.equal((await call(`/tasks/${task.id}`)).status, 404);
  assert.deepEqual(await (await call('/tasks')).json(), []);
});

// Cover every protected operation with both missing and incorrect credentials.
for (const token of [null, 'wrong-token']) {
 for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
  test(`reject ${method} with ${token === null ? 'missing' : 'invalid'} credentials`, async () => {
   const task = await create();
   const path = method === 'POST' ? '/tasks' : `/tasks/${task.id}`;
   const response = await call(path, { method, token, body: ['POST','PATCH'].includes(method) ? {title:'Intruder',completed:true} : undefined });
   assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error:'Unauthorized' });
   // Rejection must leave both the existing task and collection size unchanged.
   assert.deepEqual(await (await call(`/tasks/${task.id}`)).json(), task);
   assert.equal((await (await call('/tasks')).json()).length, 1);
  });
 }
}
// These cases cover type errors, empty input, and the first invalid length.
for (const title of ['', '   ', 1, null, 'x'.repeat(121)]) {
 test(`reject invalid title ${JSON.stringify(title)}`, async () => {
  const response = await call('/tasks', { method:'POST', body:{title} });
  assert.equal(response.status, 422);
  assert.equal(typeof (await response.json()).error, 'string');
  assert.deepEqual(await (await call('/tasks')).json(), []);
 });
}
// Accepted lower/upper boundaries and Unicode guard against over-restrictive validation.
for (const title of ['x', 'x'.repeat(120), '  Café 🌱  ']) {
 test(`accept boundary or Unicode title ${JSON.stringify(title)}`, async () => {
  const task = await create(title); assert.equal(task.title, title.trim()); assert.equal(task.completed, false);
 });
}
test('reject malformed JSON and unsupported media type', async () => {
 assert.equal((await call('/tasks',{method:'POST',raw:'{broken'})).status,400);
 assert.equal((await call('/tasks',{method:'POST',raw:'hello',contentType:'text/plain'})).status,415);
});
for (const body of [null, [], {title:'hello',admin:true}]) {
 test(`reject non-object or unexpected fields ${JSON.stringify(body)}`, async () => {
  assert.equal((await call('/tasks',{method:'POST',body})).status,422);
 });
}
// Snapshot comparisons catch APIs that partly mutate a resource before reporting an error.
test('reject invalid PATCH without mutating the task', async () => {
 const task = await create();
 for (const body of [{completed:'true'},{completed:1},{},{completed:true,title:'Hijack'}]) {
  assert.equal((await call(`/tasks/${task.id}`,{method:'PATCH',body})).status,422);
  assert.deepEqual(await (await call(`/tasks/${task.id}`)).json(),task);
 }
});
test('missing IDs return 404 for read, update, and delete', async () => {
 for (const method of ['GET','PATCH','DELETE'])
  assert.equal((await call('/tasks/999',{method,body:method === 'PATCH' ? {completed:true} : undefined})).status,404);
});
test('unsupported method returns 405', async () => {
 assert.equal((await call('/tasks',{method:'PUT'})).status,405);
});
// Compare sets of outcomes: arrival order is intentionally not part of the contract.
test('parallel creates have unique IDs and survive independently', async () => {
 const tasks = await Promise.all(Array.from({length:10},(_,i)=>create(`Task ${i}`)));
 assert.equal(new Set(tasks.map(t=>t.id)).size,10);
 const listed = await (await call('/tasks')).json();
 assert.deepEqual(listed.map(t=>t.title).sort(),tasks.map(t=>t.title).sort());
});
// Oversized bodies should fail before any new task is stored.
test('oversized input returns 413 without creating data', async () => {
 assert.equal((await call('/tasks',{method:'POST',body:{title:'x'.repeat(9000)}})).status,413);
 assert.deepEqual(await (await call('/tasks')).json(),[]);
});
