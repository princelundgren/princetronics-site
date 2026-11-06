import { runInNewContext } from 'node:vm';

export type CloudFrontRequest = {
  method: string;
  uri: string;
  querystring: Record<string, { value: string }>;
  headers: Record<string, { value: string }>;
};

export type CloudFrontResponse = {
  statusCode: number;
  statusDescription?: string;
  headers?: Record<string, { value: string }>;
};

export type CloudFrontEvent = {
  version: '1.0';
  context: { eventType: 'viewer-request' };
  viewer: { ip: string };
  request: CloudFrontRequest;
};

export type Handler = (event: CloudFrontEvent) => CloudFrontRequest | CloudFrontResponse;

/** Runs a CloudFront Function's code in a fresh `node:vm` context and returns its `handler`. Throws if it has none. */
export function loadFunction(code: string): Handler {
  const context: { handler?: unknown } = {};
  runInNewContext(code, context);
  if (typeof context.handler !== 'function') {
    throw new Error('The function code declares no handler(event)');
  }
  return context.handler as Handler;
}

/** A viewer-request event for a GET of `uri` on `host`, with `query` in CloudFront's `{ key: { value } }` form. */
export function requestEvent(host: string, uri: string, query: Record<string, string> = {}): CloudFrontEvent {
  const querystring = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, { value }]));
  return {
    version: '1.0',
    context: { eventType: 'viewer-request' },
    viewer: { ip: '192.0.2.1' },
    request: { method: 'GET', uri, querystring, headers: { host: { value: host } } },
  };
}

/** Whether the handler answered the viewer itself rather than passing the request on. */
export function isResponse(result: CloudFrontRequest | CloudFrontResponse): result is CloudFrontResponse {
  return 'statusCode' in result;
}
