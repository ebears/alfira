// ---------------------------------------------------------------------------
// Lightweight error class for API error responses.
//
// Throw ApiError from route handlers or helper functions instead of
// returning Response objects. The onError hook on apiApp catches ApiError
// and converts it to a JSON response. This keeps handler return types clean
// (plain data, never Response | data unions) so Elysia response schemas work
// without type assertions.
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
