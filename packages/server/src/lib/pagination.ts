export function parsePagination(url: URL, defaultLimit = 30) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get('limit') ?? String(defaultLimit), 10) || defaultLimit
    )
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
