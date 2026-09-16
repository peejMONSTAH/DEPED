import { Router } from 'express';

/** Express 4 does not forward rejected async handlers to the error middleware. */
export function forwardAsyncErrors(router: Router): void {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const handler of layer.route.stack) {
      const original = handler.handle;
      handler.handle = (req: any, res: any, next: any) => {
        try { Promise.resolve(original(req, res, next)).catch(next); }
        catch (error) { next(error); }
      };
    }
  }
}
