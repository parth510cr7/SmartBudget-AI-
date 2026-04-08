import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Correlates logs and responses; from X-Request-Id or generated. */
    requestId: string;
  }
}
