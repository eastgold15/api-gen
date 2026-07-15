import { Elysia } from "elysia";

export const userController = new Elysia({ prefix: "/users" })
  .get("/", () => "list");
