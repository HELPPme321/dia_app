'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');

test('Render public URL is used for same-origin validation when APP_ORIGIN is omitted', async () => {
  const db = createDatabase(':memory:');
  try {
    const { app } = createApp({
      db,
      env: {
        NODE_ENV: 'test',
        RENDER_EXTERNAL_URL: 'https://dia-app-helppme321.onrender.com'
      }
    });
    const browser = request.agent(app);
    const csrfToken = (await browser.get('/api/auth/csrf').expect(200)).body.csrfToken;

    const response = await browser
      .post('/api/auth/logout')
      .set('Origin', 'https://dia-app-helppme321.onrender.com')
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(200);
    assert.deepEqual(response.body, { ok: true });
  } finally {
    db.close();
  }
});

test('Explicit APP_ORIGIN continues to enforce the configured browser origin', async () => {
  const db = createDatabase(':memory:');
  try {
    const { app } = createApp({
      db,
      env: {
        NODE_ENV: 'test',
        APP_ORIGIN: 'https://store.example.test',
        RENDER_EXTERNAL_URL: 'https://fallback.onrender.com'
      }
    });
    const browser = request.agent(app);
    const csrfToken = (await browser.get('/api/auth/csrf').expect(200)).body.csrfToken;

    const response = await browser
      .post('/api/auth/logout')
      .set('Origin', 'https://attacker.example.test')
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(403);
    assert.equal(response.body.error.code, 'ORIGIN_NOT_ALLOWED');
  } finally {
    db.close();
  }
});
