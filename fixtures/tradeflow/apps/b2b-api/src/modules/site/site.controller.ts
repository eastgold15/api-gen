import { Elysia, t } from "elysia";
import { SiteService } from "./site.service";

const siteService = new SiteService();

export const siteController = new Elysia({ prefix: "/site" })
  .get(
    "/current",
    {
      detail: {
        summary: "获取当前站点",
        tags: ["Site"],
      },
    },
    () => siteService.getCurrent(),
  )
  .get(
    "/:id",
    {
      detail: { summary: "按 id 查询站点", tags: ["Site"] },
    },
    ({ params }) => siteService.getById(params.id),
  )
  .post(
    "/",
    {
      body: t.Object({ name: t.String() }),
      detail: { summary: "创建站点", tags: ["Site"] },
    },
    ({ body }) => siteService.create(body),
  )
  .delete(
    "/:id",
    {
      detail: { summary: "删除站点", tags: ["Site"] },
    },
    ({ params }) => siteService.remove(params.id),
  );
