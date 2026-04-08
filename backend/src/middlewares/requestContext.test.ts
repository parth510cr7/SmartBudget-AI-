import express from "express";
import request from "supertest";
import { requestContextMiddleware } from "./requestContext";

describe("requestContextMiddleware", () => {
  test("generates X-Request-Id when missing", async () => {
    const app = express();
    app.use(requestContextMiddleware);
    app.get("/t", (req, res) => {
      res.json({ id: req.requestId });
    });
    const res = await request(app).get("/t").expect(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect((res.body as { id: string }).id).toBe(res.headers["x-request-id"]);
  });

  test("honors incoming X-Request-Id", async () => {
    const app = express();
    app.use(requestContextMiddleware);
    app.get("/t", (req, res) => {
      res.json({ id: req.requestId });
    });
    const incoming = "custom-trace-id-abc";
    const res = await request(app).get("/t").set("X-Request-Id", incoming).expect(200);
    expect(res.headers["x-request-id"]).toBe(incoming);
    expect((res.body as { id: string }).id).toBe(incoming);
  });
});
