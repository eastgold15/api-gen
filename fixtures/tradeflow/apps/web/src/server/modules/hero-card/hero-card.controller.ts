import { Elysia, t } from "elysia";
import { HeroCardService } from "./hero-card.service";

const heroCardService = new HeroCardService();

export const heroCardController = new Elysia({ prefix: "/hero-card" })
  .get(
    "/",
    {
      detail: { summary: "Hero 卡列表", tags: ["HeroCard"] },
    },
    () => heroCardService.list(),
  )
  .get(
    "/:id",
    {
      detail: { summary: "Hero 卡详情", tags: ["HeroCard"] },
    },
    ({ params }) => heroCardService.detail(params.id),
  );
