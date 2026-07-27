import type { paths } from './schema';

/**
 * A small, generic, typed fetch wrapper over backend-node's OpenAPI spec —
 * not a full codegen client (e.g. openapi-typescript-codegen). Nothing
 * consumes this yet (frontend repointing is separately-scoped follow-up
 * work); this exists to prove the generate-openapi -> openapi-typescript ->
 * typed-client pipeline works end-to-end. Mirrors the hand-rolled fetch
 * style already established in client-ui/src/lib/api.ts and
 * admin-ui/src/lib/api.ts, rather than introducing an unfamiliar calling
 * convention.
 *
 * KNOWN LIMITATION: request bodies are genuinely typed and validated
 * (every controller has a class-validator DTO, and @nestjs/swagger picks
 * those up automatically) — but response bodies are not. No controller
 * method has an explicit @ApiResponse/@ApiOkResponse decorator, so
 * @nestjs/swagger emits every 200/201 response with no content schema at
 * all, and ResponseBody<Op> below resolves to `never` for every single
 * endpoint today (verified: 0 of 56 operations have a typed response in
 * the generated spec). Adding response DTOs to close this is comparable in
 * size to the request-DTO work already done and is deliberately deferred —
 * the natural place to add each one is the frontend-repointing pass, as
 * each endpoint's real response shape becomes a genuine call site instead
 * of a speculative guess.
 */

type Methods = 'get' | 'post' | 'put' | 'delete';

type PathsWithMethod<M extends Methods> = {
  [P in keyof paths]: paths[P] extends { [K in M]: unknown } ? P : never;
}[keyof paths];

type OperationOf<P extends keyof paths, M extends Methods> = paths[P] extends { [K in M]: infer Op } ? Op : never;

type JsonContent<T> = T extends { content: { 'application/json': infer J } } ? J : never;

type ResponseBody<Op> = Op extends { responses: infer R }
  ? R extends Record<string | number, unknown>
    ? JsonContent<R[Extract<keyof R, 200 | 201 | 204>]>
    : never
  : never;

type RequestBodyOf<Op> = Op extends { requestBody?: infer RB } ? JsonContent<RB> : never;

type PathParamsOf<Op> = Op extends { parameters: { path: infer P } } ? P : Record<string, never>;

export interface ApiClientConfig {
  baseUrl: string;
  /** Called per-request — the Supabase session JWT, per the spec's auth module (packages/client-core/src/auth once Phase 4 lands). */
  getAccessToken: () => string | null | undefined | Promise<string | null | undefined>;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API request failed with status ${status}`);
  }
}

export function createApiClient(config: ApiClientConfig) {
  async function request<P extends keyof paths, M extends Methods>(
    method: M,
    path: P & PathsWithMethod<M>,
    options: {
      params?: PathParamsOf<OperationOf<P, M>>;
      body?: RequestBodyOf<OperationOf<P, M>>;
    } = {},
  ): Promise<ResponseBody<OperationOf<P, M>>> {
    let url = String(path);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params as Record<string, string>)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    const token = await config.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${config.baseUrl}${url}`, {
      method: method.toUpperCase(),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }
      throw new ApiError(response.status, body);
    }

    if (response.status === 204) return undefined as ResponseBody<OperationOf<P, M>>;
    return (await response.json()) as ResponseBody<OperationOf<P, M>>;
  }

  return {
    get: <P extends PathsWithMethod<'get'>>(path: P, options?: { params?: PathParamsOf<OperationOf<P, 'get'>> }) =>
      request('get', path, options),
    post: <P extends PathsWithMethod<'post'>>(
      path: P,
      options?: { params?: PathParamsOf<OperationOf<P, 'post'>>; body?: RequestBodyOf<OperationOf<P, 'post'>> },
    ) => request('post', path, options),
    put: <P extends PathsWithMethod<'put'>>(
      path: P,
      options?: { params?: PathParamsOf<OperationOf<P, 'put'>>; body?: RequestBodyOf<OperationOf<P, 'put'>> },
    ) => request('put', path, options),
    delete: <P extends PathsWithMethod<'delete'>>(path: P, options?: { params?: PathParamsOf<OperationOf<P, 'delete'>> }) =>
      request('delete', path, options),
  };
}
