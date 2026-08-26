import { Elysia } from "elysia";
import { SiteProductService } from "./site-product.service";

const siteProductService = new SiteProductService();

export const siteProductController = new Elysia({ prefix: "/site-product" }).get(
  "/",
  {
    detail: { summary: "站点产品列表", tags: ["SiteProduct"] },
  },
  () => siteProductService.list(),
);
