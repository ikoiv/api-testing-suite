# API testing suite

[![API tests](https://github.com/ikoiv/api-testing-suite/actions/workflows/tests.yml/badge.svg)](https://github.com/ikoiv/api-testing-suite/actions/workflows/tests.yml)

A local playground for asking an API awkward questions. I enjoy the gap between “it returned 200” and “it actually did the right thing,” so these tests check contracts, stored state, and what must not change when a request fails.

## Run it

Node.js 22 or newer; no third-party dependencies or external accounts required.

```bash
npm test
npm run test:coverage
```

Each test starts a fresh server on an ephemeral port. There are no shared environments, reset endpoints, or ordering requirements.

## Coverage map

| Area | Checks |
| --- | --- |
| CRUD | Create → read → update → list → delete → verify absence |
| Contract | Exact task fields, primitive types, JSON content type, Location header, empty 204 body |
| Authentication | Missing and incorrect bearer tokens for read and write operations; no mutation on rejection |
| Input | Blank, whitespace, null, numeric, Unicode, 1/120/121-character boundaries |
| Payload | Malformed JSON, wrong media type, arrays, unexpected fields, oversized body |
| Update | Boolean-only completion; rejected updates leave prior state intact |
| Routing | Missing resources and unsupported methods |
| Parallel requests | Unique IDs and independently retained tasks |

## API contract

See [contract.md](docs/contract.md). The service lives in `demo/server.js`; the black-box HTTP tests live in `tests/tasks.test.js`. Assertions use Node's built-in strict assertions. CI runs on Node 22 and 24, including coverage output in the job logs. The badge reflects real runs, not a hard-coded result.

## Choices and limitations

A tiny owned service makes failures reproducible and avoids third-party rate limits. It is deliberately simple: in-memory storage, one fixed local demo token, and no real identity provider. It demonstrates authentication rejection, not role-based authorization or tenant isolation. Schema checks are explicit assertions rather than a general JSON Schema validator. There are no load, durability, or production security claims.

Next experiments: role/ownership boundaries, a JSON Schema validator, idempotency, and consumer-driven contracts.

MIT licensed; all data is synthetic.
