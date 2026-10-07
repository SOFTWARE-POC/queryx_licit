import { Controller, Get, Inject } from "@nestjs/common";
import { Db } from "mongodb";
import { SkipThrottle } from "@nestjs/throttler";
import { AppError } from "../common/errors";
import { MONGO_DB } from "../database/database.module";
import { Public } from "../auth/infrastructure/decorators";

@Controller("health")
export class HealthController {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    try {
      await this.db.command({ ping: 1 });
      return { status: "ok" };
    } catch {
      throw new AppError("unavailable", "MongoDB indisponível.");
    }
  }
}
