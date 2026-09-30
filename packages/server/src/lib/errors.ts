// ---------------------------------------------------------------------------
// Lightweight error class + shared error handler for API error responses.
//
// Throw ApiError from route handlers or helper functions instead of
// returning Response objects. withApiErrors registers the error mapping on
// the root Elysia instance so every route — /api and /auth alike — returns
// { error: string } JSON. This keeps handler return types clean (plain data,
// never Response | data unions) so Elysia response schemas work without type
// assertions.
//
// IMPORTANT: withApiErrors must be applied before routes or child apps are
// registered. Elysia only applies hooks to routes registered after them in
// the chain — a hook added later does not cover earlier routes.
// ---------------------------------------------------------------------------

import { type Elysia } from 'elysia';

import { logger } from '../shared/logger';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function withApiErrors(app: Elysia) {
  return app.error({ ApiError }).onError(({ error, code, set }) => {
    if (code === 'ApiError') {
      // `error` is typed as ApiError — no instanceof needed
      set.status = error.status;
      return { error: error.message };
    }
    // Unexpected error — log and return 500.
    logger.error(
      { err: error instanceof Error ? error.message : JSON.stringify(error) },
      'Unhandled API error'
    );
    set.status = 500;
    return { error: 'Internal server error.' };
  });
}
