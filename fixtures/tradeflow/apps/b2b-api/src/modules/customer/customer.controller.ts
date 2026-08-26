import { Elysia, t } from "elysia";
import { CustomerService } from "./customer.service";

const customerService = new CustomerService();

export const customerController = new Elysia({ prefix: "/customer" })
  .get(
    "/",
    {
      detail: { summary: "客户列表", tags: ["Customer"] },
    },
    () => customerService.list(),
  )
  .post(
    "/",
    {
      body: t.Object({ name: t.String() }),
      detail: { summary: "新建客户", tags: ["Customer"] },
    },
    ({ body }) => customerService.create(body),
  )
  .patch(
    "/:id",
    {
      body: t.Object({ name: t.Optional(t.String()) }),
      detail: { summary: "更新客户", tags: ["Customer"] },
    },
    ({ params, body }) => customerService.update(params.id, body),
  );
