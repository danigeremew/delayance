import { Injectable, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { defaultTemplate } from '@delayance/document-model';
import { DatabaseService } from '../database/database.service';
import { documentTemplates } from '../database/schema';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit() {
    await this.ensureDefault();
  }

  async ensureDefault() {
    const existing = await this.database.db.query.documentTemplates.findFirst({
      where: eq(documentTemplates.isDefault, true),
    });
    if (existing) return existing;

    const [created] = await this.database.db
      .insert(documentTemplates)
      .values({
        name: 'Default Professional',
        isDefault: true,
        definition: defaultTemplate(),
      })
      .returning();
    return created;
  }

  list() {
    return this.database.db.select().from(documentTemplates);
  }

  async getDefault() {
    return this.ensureDefault();
  }
}
