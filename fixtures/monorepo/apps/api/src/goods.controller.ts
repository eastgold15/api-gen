import { Elysia } from "elysia";

export const goodsController = new Elysia({ prefix: "/goods" })
  .get("/", () => "list");
