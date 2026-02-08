export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      if (attempt === retries) return response;
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delay * attempt));
  }
  throw new Error('Max retries reached');
}
