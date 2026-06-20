// server/api/admin-auth.post.ts
// Validates the admin password against ADMIN_PASSWORD in .env
// On success: sets a secure httpOnly cookie 'qurban_admin_auth'
// On failure: returns 401

import { defineEventHandler, readBody, setCookie, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password: string }>(event);

  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    throw createError({
      statusCode: 500,
      statusMessage: 'ADMIN_PASSWORD is not set in environment variables.',
    });
  }

  if (!body?.password || body.password !== expected) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Password salah. Silakan coba lagi.',
    });
  }

  // Set session cookie — NOT httpOnly so Nuxt's useCookie() can read it
  // client-side in the route middleware. The value 'granted' is not sensitive
  // (the secret never leaves this server handler), so httpOnly is unnecessary.
  setCookie(event, 'qurban_admin_auth', 'granted', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return { ok: true };
});