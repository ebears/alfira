export function parsePagination(url: URL, defaultLimit = 30) {
  const rawPage = Math.trunc(Number(url.searchParams.get('page') ?? '1')) || 1;
  const page = Math.max(1, rawPage);
  const rawLimit =
    Math.trunc(Number(url.searchParams.get('limit') ?? String(defaultLimit))) || defaultLimit;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
