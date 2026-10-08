# Task API notes

Health: `GET /health` returns `200 {"status":"ok"}` without authentication.

All task endpoints require `Authorization: Bearer local-lab-token`. This token is just for the local demo. Missing/incorrect values return `401 {"error":"Unauthorized"}`.

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| GET | `/tasks` | None | 200, array of tasks |
| POST | `/tasks` | `{"title":"Read a chapter"}` | 201, task; Location header |
| GET | `/tasks/{id}` | None | 200, task |
| PATCH | `/tasks/{id}` | `{"completed":true}` | 200, updated task |
| DELETE | `/tasks/{id}` | None | 204, empty body |

Task: `{"id":1,"title":"Read a chapter","completed":false}`. IDs are positive integers, unique within one server process. Creation trims titles and accepts 1–120 JavaScript string code units (UTF-16), not grapheme clusters. PATCH accepts only one boolean `completed` field. No additional fields are accepted in writes.

Errors return a JSON object with one `error` string. Malformed JSON: 400. Unrecognized route/resource: 404. Unsupported task method: 405. Payload over 8192 JavaScript string code units: 413. Unsupported media type: 415. Invalid fields: 422. Authentication is checked before parsing task payloads. State resets on server restart.

The length limits count JavaScript string units, not bytes.
