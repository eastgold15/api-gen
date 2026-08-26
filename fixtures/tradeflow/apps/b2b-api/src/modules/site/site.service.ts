export class SiteService {
  getCurrent() { return { id: "1" }; }
  getById(_id: string) { return { id: _id }; }
  create(_body: { name: string }) { return { id: "new" }; }
  remove(_id: string) { return { ok: true }; }
}
