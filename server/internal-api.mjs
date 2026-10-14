/**
 * Run Jobster REST handlers in-process with the caller's cookie (HomeKept-style inject).
 */
import {handleApi, handleError} from './api.mjs';
import {ValidationError} from './validation.mjs';

export async function injectApi(db, {method, path, cookie = '', body, options = {}, host = '127.0.0.1'}) {
  if (!path.startsWith('/api/')) throw new ValidationError('path must start with /api/', 400);
  if (path.startsWith('/api/assistant')) throw new ValidationError('assistant endpoints are not injectable', 400);

  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  let offset = 0;

  const req = {
    method: method || 'GET',
    headers: {
      cookie: cookie || '',
      'content-type': 'application/json',
      origin: options.allowedOrigin || `http://${host}`,
      host
    },
    socket: {remoteAddress: '127.0.0.1'},
    async *[Symbol.asyncIterator]() {
      if (!payload) return;
      while (offset < payload.length) {
        const next = payload.subarray(offset, offset + 4096);
        offset += next.length;
        yield next;
      }
    }
  };

  return await new Promise((resolve) => {
    let statusCode = 200;
    const res = {
      headersSent: false,
      writeHead(code) {
        statusCode = code;
        this.headersSent = true;
      },
      end(data) {
        let parsed = data;
        try { parsed = JSON.parse(String(data || '{}')); } catch { parsed = {raw: String(data || '')}; }
        resolve({status: statusCode, data: parsed});
      }
    };
    const url = new URL(path, `http://${host}`);
    handleApi(req, res, db, url, options).catch((error) => {
      handleError(error, res);
    });
  });
}
