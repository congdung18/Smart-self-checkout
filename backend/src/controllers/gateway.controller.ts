import type { Request, Response } from "express";
import { MockGatewayService } from "../services/mock-gateway.service.js";
import { signedHeaders } from "../utils/security.js";
import { uuid } from "../validators/checkout.js";
import { gatewayInput, outcomeInput } from "../validators/gateway.js";
export class GatewayController {
  constructor(
    private service: MockGatewayService,
    private secret: string,
  ) {}
  private send(res: Response, route: string, event: unknown) {
    const body = JSON.stringify(event);
    res.set(signedHeaders(this.secret, "RESPONSE", route, body)).send(body);
  }
  create = async (req: Request, res: Response) => {
    const input = gatewayInput.parse(req.body);
    const event = await this.service.create(input);
    if (input.scenario === "timeout") {
      setTimeout(() => {
        if (!res.destroyed) res.status(504).end();
      }, 1600).unref();
      return;
    }
    this.send(res, req.path, event);
  };
  query = async (req: Request, res: Response) => {
    this.send(
      res,
      req.path,
      await this.service.query(uuid.parse(req.params.id)),
    );
  };
  outcome = async (req: Request, res: Response) => {
    res.json(
      await this.service.outcome(
        uuid.parse(req.params.id),
        outcomeInput.parse(req.body).status,
      ),
    );
  };
}
