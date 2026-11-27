// Driver: a bare node:http server. Routes come from the composition root.
import { createServer } from 'node:http';

export function startServer(routes, port = 0) {
  const server = createServer(async (req, res) => {
    const handler = routes[`${req.method} ${req.url}`];
    const [status, body] = handler ? await handler() : [404, { error: 'not found' }];
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  return server.listen(port);
}
