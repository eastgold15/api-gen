export class CustomerService {
  list() { return []; }
  create(_body: { name: string }) { return { id: "1" }; }
  update(_id: string, _body: Partial<{ name: string }>) { return { id: _id }; }
}
