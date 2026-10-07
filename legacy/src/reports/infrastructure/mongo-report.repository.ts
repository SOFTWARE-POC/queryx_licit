import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Collection, Db, ObjectId } from "mongodb";
import { MONGO_DB } from "../../database/database.module";
import { ReportDefinition } from "../domain/report-definition";
import { NewReport, ReportRepositoryPort } from "../domain/report-repository.port";

interface ReportDocument extends Omit<NewReport, "createdBy"> {
  _id: ObjectId;
  company: ObjectId;
  createdBy?: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function toDomain(doc: ReportDocument): ReportDefinition {
  return {
    id: doc._id.toHexString(),
    system: false,
    code: doc.code,
    name: doc.name,
    category: doc.category,
    description: doc.description,
    visualization: doc.visualization,
    spec: doc.spec,
    kpis: doc.kpis,
    trend: doc.trend,
    usesPeriod: doc.usesPeriod,
    createdBy: doc.createdBy,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Collection própria do serviço — a única em que ele escreve. */
@Injectable()
export class MongoReportRepository implements ReportRepositoryPort, OnModuleInit {
  private readonly collection: Collection<ReportDocument>;

  constructor(@Inject(MONGO_DB) db: Db) {
    this.collection = db.collection<ReportDocument>("report_definitions");
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndex({ company: 1, updatedAt: -1 });
  }

  private scoped(companyId: string, id?: string) {
    const filter: Record<string, unknown> = { company: new ObjectId(companyId) };
    if (id !== undefined) filter._id = new ObjectId(id);
    return filter;
  }

  async listByCompany(companyId: string): Promise<ReportDefinition[]> {
    const docs = await this.collection.find(this.scoped(companyId)).sort({ updatedAt: -1 }).limit(500).toArray();
    return docs.map(toDomain);
  }

  async findInCompany(companyId: string, id: string): Promise<ReportDefinition | null> {
    if (!OBJECT_ID.test(id)) return null;
    const doc = await this.collection.findOne(this.scoped(companyId, id));
    return doc ? toDomain(doc) : null;
  }

  async create(companyId: string, report: NewReport): Promise<ReportDefinition> {
    const now = new Date();
    const doc: ReportDocument = { ...report, _id: new ObjectId(), company: new ObjectId(companyId), createdAt: now, updatedAt: now };
    await this.collection.insertOne(doc);
    return toDomain(doc);
  }

  async update(companyId: string, id: string, report: NewReport): Promise<ReportDefinition | null> {
    if (!OBJECT_ID.test(id)) return null;
    const { createdBy: _author, ...changes } = report;
    const doc = await this.collection.findOneAndUpdate(
      this.scoped(companyId, id),
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return doc ? toDomain(doc) : null;
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    if (!OBJECT_ID.test(id)) return false;
    const result = await this.collection.deleteOne(this.scoped(companyId, id));
    return result.deletedCount === 1;
  }
}
