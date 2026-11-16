import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApplicationService } from "../services/application.service.js";
import { CheckoutService } from "../services/checkout.service.js";
import { GatewayClient } from "../services/payment.service.js";
import {
  eventSchema,
  key,
  listInput,
  paymentInput,
  productInput,
  quantity,
  reportInput,
  uuid,
  version,
} from "../validators/checkout.js";
export class ApiController {
  constructor(
    private application: ApplicationService,
    private checkout: CheckoutService,
    private gateway: GatewayClient,
    private secure: boolean,
  ) {}
  bootstrap = async (req: Request, res: Response) => {
    res.json({
      csrf: req.session.csrf,
      user: await this.application.user(req.session.userId),
    });
  };
  health = async (_req: Request, res: Response) => {
    await this.application.health();
    res.json({ status: "ready" });
  };
  login = async (req: Request, res: Response) => {
    const input = z
      .object({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(200),
      })
      .strict()
      .parse(req.body);
    const user = await this.application.login(input.username, input.password);
    const owner = req.session.owner;
    await new Promise<void>((done, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : done())),
    );
    req.session.owner = owner;
    req.session.userId = user.id;
    req.session.csrf = randomBytes(32).toString("hex");
    res.json({ user, csrf: req.session.csrf });
  };
  logout = async (req: Request, res: Response) => {
    await new Promise<void>((done, reject) =>
      req.session.destroy((e) => (e ? reject(e) : done())),
    );
    res
      .clearCookie("ssc.sid", {
        httpOnly: true,
        secure: this.secure,
        sameSite: "strict",
      })
      .sendStatus(204);
  };
  lookup = async (req: Request, res: Response) => {
    res.json(
      await this.application.lookup(
        z.string().trim().min(1).max(64).parse(req.query.code),
      ),
    );
  };
  currentCart = async (req: Request, res: Response) => {
    res.json(await this.application.currentCart(req.session.owner!));
  };
  startCart = async (req: Request, res: Response) => {
    z.object({}).strict().parse(req.body);
    res.status(201).json(await this.application.startCart(req.session.owner!));
  };
  cart = async (req: Request, res: Response) => {
    res.json(
      await this.checkout.cart(uuid.parse(req.params.id), req.session.owner!),
    );
  };
  add = async (req: Request, res: Response) => {
    const data = z
      .object({ productId: uuid, quantity, version, key })
      .strict()
      .parse(req.body);
    res.json(
      await this.checkout.mutate(
        uuid.parse(req.params.id),
        req.session.owner!,
        data.version,
        { kind: "add", ...data },
      ),
    );
  };
  setQuantity = async (req: Request, res: Response) => {
    const data = z.object({ quantity, version }).strict().parse(req.body);
    res.json(
      await this.checkout.mutate(
        uuid.parse(req.params.id),
        req.session.owner!,
        data.version,
        {
          kind: "set",
          itemId: uuid.parse(req.params.itemId),
          quantity: data.quantity,
        },
      ),
    );
  };
  remove = async (req: Request, res: Response) => {
    const data = z
      .object({ version, confirmed: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(
      await this.checkout.mutate(
        uuid.parse(req.params.id),
        req.session.owner!,
        data.version,
        { kind: "delete", itemId: uuid.parse(req.params.itemId) },
      ),
    );
  };
  cancel = async (req: Request, res: Response) => {
    const data = z
      .object({ version, confirmed: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(
      await this.checkout.mutate(
        uuid.parse(req.params.id),
        req.session.owner!,
        data.version,
        { kind: "cancel" },
      ),
    );
  };
  pay = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.gateway.start(
          uuid.parse(req.params.id),
          req.session.owner!,
          paymentInput.parse(req.body),
        ),
      );
  };
  payment = async (req: Request, res: Response) => {
    res.json(
      await this.gateway.read(uuid.parse(req.params.id), req.session.owner!),
    );
  };
  simulate = async (req: Request, res: Response) => {
    const data = z
      .object({ status: z.enum(["success", "failure"]) })
      .strict()
      .parse(req.body);
    res.json(
      await this.gateway.simulate(
        uuid.parse(req.params.id),
        req.session.owner!,
        data.status,
      ),
    );
  };
  callback = async (req: Request, res: Response) => {
    await this.checkout.apply(eventSchema.parse(JSON.parse(req.body)));
    res.json({ accepted: true });
  };
  monitor = async (req: Request, res: Response) => {
    const { page } = listInput.parse(req.query);
    res.json(await this.application.monitoring(req.session.userId, page));
  };
  inventory = async (req: Request, res: Response) => {
    const { page, search } = listInput.parse(req.query);
    res.json(
      await this.application.inventory(req.session.userId, page, search),
    );
  };
  createProduct = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.application.createProduct(
          req.session.userId,
          productInput.parse(req.body),
        ),
      );
  };
  product = async (req: Request, res: Response) => {
    res.json(
      await this.application.product(
        req.session.userId,
        uuid.parse(req.params.id),
      ),
    );
  };
  updateProduct = async (req: Request, res: Response) => {
    const { version: expected, ...data } = productInput
      .extend({ version })
      .parse(req.body);
    res.json(
      await this.application.updateProduct(
        req.session.userId,
        uuid.parse(req.params.id),
        expected,
        data,
      ),
    );
  };
  report = async (req: Request, res: Response) => {
    const { start, end, page } = reportInput.parse(req.query);
    res.json(
      await this.application.report(
        req.session.userId,
        new Date(start),
        new Date(end),
        page,
      ),
    );
  };
}
