import { Inject, Injectable } from "@nestjs/common";
import { Db, Decimal128, MongoServerError, ObjectId } from "mongodb";
import { AppError } from "../../common/errors";
import { MONGO_DB } from "../../database/database.module";
import { PipelineStage } from "../domain/types";
import { QueryExecutorPort } from "../application/query-executor.port";

const MAX_TIME_MS_EXPIRED = 50;

/** Tipos BSON que o JSON não entende viram primitivos (Decimal128 → número, ObjectId → texto). */
function normalize(value: unknown): unknown {
  if (value instanceof Decimal128) return Number(value.toString());
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

@Injectable()
export class MongoQueryExecutorAdapter implements QueryExecutorPort {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async aggregate(
    collection: string,
    pipeline: PipelineStage[],
    options: { timeoutMs: number },
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const rows = await this.db
        .collection(collection)
        .aggregate(pipeline, { allowDiskUse: true, maxTimeMS: options.timeoutMs })
        .toArray();
      return rows.map((row) => normalize(row) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === MAX_TIME_MS_EXPIRED) {
        throw new AppError(
          "timeout",
          "A consulta passou do tempo limite. Reduza o período ou a quantidade de agrupamentos.",
        );
      }
      throw error;
    }
  }
}
